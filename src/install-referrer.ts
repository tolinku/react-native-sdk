import { Platform } from 'react-native';
import { debugWarn } from './debug';

/**
 * The Play Install Referrer, the deterministic half of deferred linking on
 * Android.
 *
 * A Tolinku link sends an Android visitor to the store with
 * `referrer=tolk_token=<token>` attached. Play keeps that string through the
 * install and returns it on first launch, naming the exact click rather than
 * inferring it from device signals.
 *
 * Reading it needs a Play Services binding, which is native code. This package
 * stays pure JavaScript on purpose, so the referrer is read through whichever
 * module the app already has: pass one to `claimDeferredLink`, or install a
 * referrer package and it is picked up automatically. Without either, deferred
 * linking still works through signal matching, less precisely.
 */

const TOKEN_KEY = 'tolk_token';

/**
 * Pull our token out of a Play referrer string.
 *
 * The referrer is shared. A developer's own `utm_source` and anything else they
 * attached sit in the same string, so the token is found among the pairs rather
 * than assumed to be the whole value. A percent-encoded `%3D` is tolerated
 * because Play normally decodes it, and that assumption is not worth a lost
 * install if it is ever wrong.
 */
export function parseInstallReferrer(referrer: string | null | undefined): string | null {
  if (!referrer || !referrer.trim()) return null;

  let decoded = referrer;
  try {
    decoded = decodeURIComponent(referrer);
  } catch {
    // Malformed encoding: fall back to the raw string.
  }

  const pair = decoded
    .split('&')
    .map(p => p.trim())
    .find(p => p.startsWith(`${TOKEN_KEY}=`));

  if (!pair) return null;
  const token = pair.slice(TOKEN_KEY.length + 1);
  return token.trim() ? token : null;
}

/** Anything that can hand back a Play referrer string. */
export type ReferrerProvider = () => Promise<string | null> | string | null;

/**
 * Modules known to expose the referrer, tried in order when no provider is
 * given. `require` is wrapped because the package is optional by design: a
 * missing module is the ordinary case, not a failure.
 */
function findInstalledProvider(): ReferrerProvider | null {
  const candidates: Array<() => ReferrerProvider | null> = [
    () => {
      // react-native-play-install-referrer
      const mod = require('react-native-play-install-referrer');
      const api = mod?.PlayInstallReferrer ?? mod?.default ?? mod;
      if (typeof api?.getInstallReferrerInfo !== 'function') return null;
      return () =>
        new Promise<string | null>(resolve => {
          api.getInstallReferrerInfo((info: any, err: any) => {
            resolve(err ? null : info?.installReferrer ?? null);
          });
        });
    },
  ];

  for (const candidate of candidates) {
    try {
      const provider = candidate();
      if (provider) return provider;
    } catch {
      // Not installed. Expected.
    }
  }
  return null;
}

/**
 * Best effort at the referrer token for this install.
 *
 * Android only, and null everywhere else: there is no equivalent on iOS, which
 * is why signal matching exists at all. Never throws, because attribution must
 * not be able to fail a first launch.
 */
export async function getInstallReferrerToken(
  provider?: ReferrerProvider,
): Promise<string | null> {
  if (Platform.OS !== 'android') return null;

  const source = provider ?? findInstalledProvider();
  if (!source) return null;

  try {
    const referrer = await source();
    return parseInstallReferrer(referrer);
  } catch (err) {
    debugWarn(`Install referrer lookup failed: ${(err as Error).message}`);
    return null;
  }
}
