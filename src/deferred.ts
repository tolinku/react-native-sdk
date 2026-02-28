import { Dimensions } from 'react-native';
import type { HttpClient } from './client';
import type { DeferredLink, ClaimBySignalsOptions } from './types';
import { debugWarn } from './debug';

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

  /** Claim a deferred deep link by device signal matching */
  async claimBySignals(options: ClaimBySignalsOptions): Promise<DeferredLink | null> {
    if (!options.appspaceId || !options.appspaceId.trim()) {
      throw new Error('Tolinku: appspaceId is required and must not be blank for claimBySignals.');
    }

    try {
      const { width, height } = Dimensions.get('screen');
      const resolvedTimezone = options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      // React Native does not expose navigator.language in all environments,
      // so allow it to be passed explicitly or fall back to a sensible default.
      const resolvedLanguage = options.language || 'en';

      return await this.client.postPublic<DeferredLink>('/v1/api/deferred/claim-by-signals', {
        appspace_id: options.appspaceId,
        timezone: resolvedTimezone,
        language: resolvedLanguage,
        screen_width: options.screenWidth || width,
        screen_height: options.screenHeight || height,
      });
    } catch (err) {
      debugWarn(`Deferred claimBySignals failed: ${(err as Error).message}`);
      return null;
    }
  }
}
