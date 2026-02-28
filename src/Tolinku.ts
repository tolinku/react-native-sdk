import { HttpClient } from './client';
import { Analytics } from './analytics';
import { Referrals } from './referrals';
import { Deferred } from './deferred';
import { validateBaseUrl } from './validation';
import { setDebugEnabled, debugLog, debugWarn } from './debug';
import { setStorageNamespace, resetStorageNamespace } from './storage';
import { SDK_VERSION } from './types';
import type { TolinkuConfig, ResolvedTolinkuConfig, TrackProperties } from './types';

/**
 * Main Tolinku SDK singleton.
 *
 * Initialize once with Tolinku.init(), then use static methods for all operations.
 *
 * Example:
 *   Tolinku.init({ apiKey: 'tolk_pub_...' });
 *   await Tolinku.track('signup', { source: 'onboarding' });
 */
export class Tolinku {
  static readonly VERSION = SDK_VERSION;

  private static client: HttpClient | null = null;
  private static analyticsInstance: Analytics | null = null;
  private static referralsInstance: Referrals | null = null;
  private static deferredInstance: Deferred | null = null;
  private static _initialized = false;
  private static _userId: string | null = null;

  /**
   * Initialize the SDK. Must be called before any other method.
   *
   * If init() is called a second time without calling destroy() first,
   * a warning is logged and the existing instance is returned.
   */
  static init(config: TolinkuConfig): void {
    if (!config.apiKey) throw new Error('Tolinku: apiKey is required');

    // Double-init guard: warn and return if already configured
    if (Tolinku._initialized) {
      debugWarn(
        'Tolinku.init() called while already initialized. ' +
        'Call Tolinku.destroy() first if you need to reconfigure.'
      );
      // Also log to console even without debug mode, since this is a potential bug
      console.warn(
        '[TolinkuSDK] init() called while already initialized. ' +
        'Call Tolinku.destroy() first if you need to reconfigure.'
      );
      return;
    }

    // Resolve defaults
    const baseUrl = config.baseUrl || 'https://api.tolinku.com';

    // Validate HTTPS
    validateBaseUrl(baseUrl);

    // Enable/disable debug logging
    setDebugEnabled(config.debug === true);

    const resolvedConfig: ResolvedTolinkuConfig = {
      apiKey: config.apiKey,
      baseUrl,
      debug: config.debug === true,
      timeout: config.timeout ?? 30000,
    };

    // Namespace storage keys by API key
    setStorageNamespace(config.apiKey);

    Tolinku.client = new HttpClient(resolvedConfig);
    Tolinku.analyticsInstance = new Analytics(Tolinku.client);
    Tolinku.referralsInstance = new Referrals(Tolinku.client);
    Tolinku.deferredInstance = new Deferred(Tolinku.client);
    Tolinku._initialized = true;

    debugLog(`Tolinku SDK v${SDK_VERSION} initialized (baseUrl=${baseUrl})`);
  }

  /** Check whether the SDK has been initialized. */
  static isConfigured(): boolean {
    return Tolinku._initialized;
  }

  /**
   * Set the user ID for segment targeting and analytics attribution.
   * Pass null to clear the user ID.
   */
  static setUserId(userId: string | null): void {
    Tolinku._userId = userId;
  }

  /** Get the current user ID, or null if not set. */
  static getUserId(): string | null {
    return Tolinku._userId;
  }

  /** Get the underlying HTTP client (used internally by MessageProvider) */
  static getClient(): HttpClient {
    if (!Tolinku.client) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    return Tolinku.client;
  }

  /**
   * Track a custom event (shorthand for analytics.track).
   * Event type is auto-prefixed with "custom." if not already.
   * Events are batched and flushed automatically.
   */
  static async track(eventType: string, properties?: TrackProperties): Promise<void> {
    if (!Tolinku.analyticsInstance) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    const mergedProps = Tolinku._userId
      ? { user_id: Tolinku._userId, ...properties }
      : properties;
    return Tolinku.analyticsInstance.track(eventType, mergedProps);
  }

  /**
   * Immediately flush all queued analytics events to the server.
   */
  static async flush(): Promise<void> {
    if (!Tolinku.analyticsInstance) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    return Tolinku.analyticsInstance.flush();
  }

  /** Referrals: create, complete, milestone, leaderboard, claimReward */
  static get referrals(): Referrals {
    if (!Tolinku.referralsInstance) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    return Tolinku.referralsInstance;
  }

  /** Deferred deep links: claimByToken, claimBySignals */
  static get deferred(): Deferred {
    if (!Tolinku.deferredInstance) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    return Tolinku.deferredInstance;
  }

  /**
   * Shut down the SDK and release resources.
   * Flushes remaining analytics events, cancels timers, removes listeners,
   * and aborts in-flight requests. After calling this, you must call init()
   * again before using the SDK.
   */
  static async destroy(): Promise<void> {
    debugLog('Tolinku SDK shutting down');

    // Flush and clean up analytics (timer, AppState listener)
    if (Tolinku.analyticsInstance) {
      await Tolinku.analyticsInstance.destroy();
    }

    // Abort all in-flight HTTP requests
    if (Tolinku.client) {
      Tolinku.client.abort();
    }

    // Reset storage namespace
    resetStorageNamespace();

    // Clear all references
    Tolinku.client = null;
    Tolinku.analyticsInstance = null;
    Tolinku.referralsInstance = null;
    Tolinku.deferredInstance = null;
    Tolinku._initialized = false;
    Tolinku._userId = null;

    // Reset debug mode
    setDebugEnabled(false);
  }
}
