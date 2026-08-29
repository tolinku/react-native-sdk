import { Dimensions, PixelRatio, Platform } from 'react-native';
import type { HttpClient } from './client';
import type { DeferredLink, ClaimBySignalsOptions } from './types';
import { debugWarn } from './debug';
import { getInstallReferrerToken, type ReferrerProvider } from './install-referrer';

export class Deferred {
  constructor(private client: HttpClient) {}

  /** Claim a deferred deep link by referrer token (from Play Store referrer or clipboard) */
  async claimByToken(token: string): Promise<DeferredLink | null> {
    if (!token || !token.trim()) {
      throw new Error('Tolinku: token is required and must not be blank for claimByToken.');
    }

    try {
      return await this.client.getPublic<DeferredLink>('/v1/api/deferred/claim', { token });
    } catch (err) {
      debugWarn(`Deferred claimByToken failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Recover the link that led to this install, trying both mechanisms.
   *
   * The Play Install Referrer is asked first on Android: it names the exact
   * click, survives for days, and does not care which network the device was
   * on. Device signals are the fallback, and the only option on iOS, where no
   * equivalent exists.
   *
   * Call once on first launch. Safe to call again, but a claim is consumed the
   * first time it succeeds, so a second call returns null.
   *
   * Reading the referrer needs a native Play Services binding, which this
   * package deliberately does not bundle. Pass `referrerProvider`, or install a
   * supported referrer package and it is used automatically. Without either,
   * Android falls back to signal matching.
   */
  async claimDeferredLink(options: {
    appspaceId: string;
    referrerProvider?: ReferrerProvider;
  }): Promise<DeferredLink | null> {
    if (!options.appspaceId || !options.appspaceId.trim()) {
      throw new Error('Tolinku: appspaceId is required and must not be blank for claimDeferredLink.');
    }

    const token = await getInstallReferrerToken(options.referrerProvider);
    if (token) {
      // A referrer that cannot be claimed is worth one fallback rather than an
      // error: the install still happened.
      const byToken = await this.claimByToken(token).catch(() => null);
      if (byToken) return byToken;
    }

    return this.claimBySignals({ appspaceId: options.appspaceId });
  }

  /** Claim a deferred deep link by device signal matching */
  async claimBySignals(options: ClaimBySignalsOptions): Promise<DeferredLink | null> {
    if (!options.appspaceId || !options.appspaceId.trim()) {
      throw new Error('Tolinku: appspaceId is required and must not be blank for claimBySignals.');
    }

    try {
      const { width, height } = Dimensions.get('screen');
      const resolvedTimezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Matched against the landing page's `navigator.language`, a full BCP-47 tag
      // such as "ko-KR". Defaulting to a bare "en" meant the language signal
      // almost never scored. Intl reports the device locale with its region on
      // any runtime with Intl support (Hermes has it enabled by default).
      const resolvedLanguage =
        options.language ||
        (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
          ? Intl.DateTimeFormat().resolvedOptions().locale
          : undefined) ||
        'en';

      return await this.client.postPublic<DeferredLink>('/v1/api/deferred/claim-by-signals', {
        appspace_id: options.appspaceId,
        timezone: resolvedTimezone,
        language: resolvedLanguage,
        screen_width: options.screenWidth || width,
        screen_height: options.screenHeight || height,
        // Separates devices reporting identical dp dimensions.
        device_pixel_ratio: options.devicePixelRatio || PixelRatio.get(),
        os_version: options.osVersion || String(Platform.Version),
      });
    } catch (err) {
      // A 404 is the ordinary "nothing waiting for this device" outcome. Anything
      // else is a configuration problem the integrator has to see: in particular a
      // 403 means appspaceId is wrong, and silently returning null there turns a
      // one-line fix into days of debugging.
      const status = (err as { statusCode?: number; status?: number })?.statusCode
        ?? (err as { status?: number })?.status;
      if (status === 404) {
        // Nothing is waiting for this device. The ordinary outcome, not a fault.
        debugWarn('Deferred claimBySignals: no match for this device.');
        return null;
      }
      if (status === 403) {
        console.warn(
          '[Tolinku] claimBySignals failed with HTTP 403. Check that appspaceId is your ' +
          'Appspace ID (copy it from the dashboard under Settings), not your subdomain ' +
          `or slug. ${(err as Error).message}`,
        );
        return null;
      }
      debugWarn(`Deferred claimBySignals failed: ${(err as Error).message}`);
      return null;
    }
  }
}
