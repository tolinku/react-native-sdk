import { AppState, Platform, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import type { HttpClient } from './client';
import type { TrackProperties } from './types';
import { validateEventType } from './validation';
import { debugLog, debugWarn } from './debug';

/** Number of events that triggers an automatic flush. */
const BATCH_SIZE = 10;
/** Maximum time (ms) to wait before flushing after the first queued event. */
const FLUSH_INTERVAL_MS = 5000;
/** Maximum number of events to keep in the queue to prevent unbounded growth. */
const MAX_QUEUE_SIZE = 1000;

interface QueuedEvent {
  event_type: string;
  properties: TrackProperties;
}

export class Analytics {
  private client: HttpClient;
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private isFlushing = false;

  constructor(client: HttpClient) {
    this.client = client;

    // Listen for app going to background to flush events
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
  }

  /**
   * Track a custom event. The event is added to the internal queue
   * and will be flushed automatically or when flush() is called.
   *
   * Event type must match /^custom\.[a-z0-9_]+$/.
   * Auto-prefixes with "custom." if missing.
   */
  /**
   * Set once the server says this Appspace does not attribute app opens, so the
   * setting costs one request a launch rather than one per link.
   */
  private appOpensDisabled = false;

  /**
   * The last link reported, and when. Cold start and the link stream can both
   * deliver the same tap, depending on the plugin, so an app instrumenting both
   * paths would otherwise report it twice and be billed twice. A genuine second
   * tap of the same link inside this window is implausible; a duplicate delivery
   * of one tap is not.
   */
  private lastOpenUrl: string | null = null;
  private lastOpenAt = 0;
  private static readonly OPEN_DEDUPE_MS = 5000;


  /**
   * Report that a link opened the app without the browser being involved.
   *
   * A Universal Link or App Link hands the app the URL directly, so Tolinku is
   * never contacted and the tap goes unrecorded. Those taps come from people who
   * already have the app, so leaving them out makes a re-engagement campaign
   * look like a failure exactly when it worked.
   *
   * Only http and https links are reported. A custom scheme means Tolinku's own
   * hand-off page opened the app, and that tap was counted when the page was
   * served, so passing one does nothing rather than counting it twice.
   *
   * Never throws. This runs on the path that routes the user somewhere, and a
   * tap that goes unrecorded is not worth interrupting that.
   */
  async trackLinkOpen(url: string, userId?: string): Promise<void> {
    if (this.appOpensDisabled) return;

    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (!trimmed) return;

    // The scheme decides, and the server checks it again.
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;

    const now = Date.now();
    if (this.lastOpenUrl === trimmed && now - this.lastOpenAt < Analytics.OPEN_DEDUPE_MS) return;
    this.lastOpenUrl = trimmed;
    this.lastOpenAt = now;

    try {
      const result = await this.client.postPublic<{ attribute?: boolean }>(
        '/v1/api/opens',
        {
          url: trimmed,
          // The User-Agent cannot say which platform this is: this SDK
          // identifies itself the same way on both. Without it an app open has
          // no platform and lands in a blank bucket on every breakdown.
          platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
          ...(userId ? { user_id: userId } : {}),
        },
      );
      if (result?.attribute === false) this.appOpensDisabled = true;
    } catch {
      // Deliberately silent.
    }
  }

  async track(eventType: string, properties?: TrackProperties): Promise<void> {
    const normalizedType = validateEventType(eventType);

    const event: QueuedEvent = {
      event_type: normalizedType,
      properties: properties || {},
    };

    // Enforce max queue size
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      debugWarn(
        `Analytics queue is full (${MAX_QUEUE_SIZE} events). Dropping oldest event to make room.`
      );
      this.queue.shift();
    }

    this.queue.push(event);

    if (this.queue.length >= BATCH_SIZE) {
      await this.flush();
    } else if (this.queue.length === 1) {
      // First event in the queue; start the flush timer
      this.startFlushTimer();
    }
  }

  /**
   * Immediately flush all queued events to the server.
   * If the queue is empty, this is a no-op.
   * If a flush is already in progress, this is a no-op to prevent race conditions.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.isFlushing) return;

    this.isFlushing = true;

    // Take a snapshot and clear the queue
    const eventsToSend = this.queue.splice(0, this.queue.length);
    this.cancelFlushTimer();

    try {
      debugLog(`Flushing ${eventsToSend.length} analytics event(s)`);
      const result = await this.client.post<{ ok: boolean; accepted?: number; errors?: string[] }>('/v1/api/analytics/batch', {
        events: eventsToSend,
      });
      if (result.errors && result.errors.length > 0) {
        debugWarn(`Batch partial failure: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      debugWarn(`Failed to flush analytics events: ${(err as Error).message}`);
      // Re-enqueue events at the front (up to MAX_QUEUE_SIZE)
      const spaceLeft = MAX_QUEUE_SIZE - this.queue.length;
      if (spaceLeft > 0) {
        this.queue.unshift(...eventsToSend.slice(0, spaceLeft));
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Shut down the analytics module: flush remaining events, cancel the timer,
   * and remove the AppState listener.
   */
  async destroy(): Promise<void> {
    this.cancelFlushTimer();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;

    try {
      await this.flush();
    } catch {
      // Best-effort flush during shutdown
    }
  }

  private handleAppStateChange = (state: AppStateStatus): void => {
    if (state === 'background' || state === 'inactive') {
      // Fire-and-forget flush when going to background
      this.flush().catch(() => {});
    }
  };

  private startFlushTimer(): void {
    this.cancelFlushTimer();
    this.flushTimer = setTimeout(() => {
      this.flush().catch((err) => {
        debugWarn(`Timer flush failed: ${(err as Error).message}`);
      });
    }, FLUSH_INTERVAL_MS);
  }

  private cancelFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
