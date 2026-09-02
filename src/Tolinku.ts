import { HttpClient } from './client';
import { Analytics } from './analytics';
import { Ecommerce } from './ecommerce';
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
  private static ecommerceInstance: Ecommerce | null = null;
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
  /**
   * Configure the SDK.
   *
   * The name the Android, iOS and Flutter SDKs use for this. {@link init} does
   * the same thing and still works; it is what this package shipped and
   * breaking it would serve nobody. It is meant for deprecation later, once
   * moving off it is a one-line change rather than a surprise.
   */
  static configure(config: TolinkuConfig): void {
    Tolinku.init(config);
  }

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
    Tolinku.ecommerceInstance = new Ecommerce(Tolinku.client, () => Tolinku._userId);
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
   * Report that a link opened the app, when it opened without the browser.
   *
   * A Universal Link or App Link hands the app the URL directly, so Tolinku is
   * never contacted and the tap goes unrecorded. Those taps come from people who
   * already have your app, so leaving them out makes a re-engagement campaign
   * look like a failure exactly when it worked.
   *
   * Both ways a link arrives need it. The listener fires only while the app is
   * already running, so a link that launched the app cold arrives separately:
   *
   * ```ts
   * // Launched by a link, app was not running.
   * const initial = await Linking.getInitialURL();
   * if (initial) Tolinku.trackLinkOpen(initial);
   *
   * // Tapped while the app was already open.
   * Linking.addEventListener('url', ({ url }) => {
   *   Tolinku.trackLinkOpen(url);
   *   // your own routing
   * });
   * ```
   *
   * Wiring both is safe: the same link arriving twice in quick succession is
   * reported once.
   *
   * Only http and https links are reported. A custom scheme means Tolinku's own
   * hand-off page opened the app, and that tap is already counted.
   *
   * Never throws.
   */
  static async trackLinkOpen(url: string): Promise<void> {
    // Unlike track, a missing instance is not worth throwing over: this sits on
    // the path that routes the user somewhere.
    if (!Tolinku.analyticsInstance) return;
    return Tolinku.analyticsInstance.trackLinkOpen(url, Tolinku._userId ?? undefined);
  }

  /**
   * Immediately flush all queued analytics and ecommerce events to the server.
   */
  static async flush(): Promise<void> {
    if (!Tolinku.analyticsInstance) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    await Promise.all([
      Tolinku.analyticsInstance.flush(),
      Tolinku.ecommerceInstance?.flush(),
    ]);
  }

  /** Ecommerce: track purchases, carts, products, revenue */
  static get ecommerce(): Ecommerce {
    if (!Tolinku.ecommerceInstance) {
      throw new Error('Tolinku: SDK not initialized. Call Tolinku.init() first.');
    }
    return Tolinku.ecommerceInstance;
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

    // Flush and clean up analytics + ecommerce (timers, AppState listeners)
    if (Tolinku.analyticsInstance) {
      await Tolinku.analyticsInstance.destroy();
    }
    if (Tolinku.ecommerceInstance) {
      await Tolinku.ecommerceInstance.destroy();
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
    Tolinku.ecommerceInstance = null;
    Tolinku.referralsInstance = null;
    Tolinku.deferredInstance = null;
    Tolinku._initialized = false;
    Tolinku._userId = null;

    // Reset debug mode
    setDebugEnabled(false);
  }
}
