import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
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
