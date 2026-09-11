import type { HttpClient } from './client';
import type { ResolvedLink } from './types';
import { debugWarn } from './debug';

/**
 * Working out what a link the operating system handed the app actually means.
 *
 * An app receives the URL that was tapped, exactly as it was written. That is
 * fine while the URL is readable: `/order/1007100` says "order" and the app can
 * route it. It is not fine for a short link, which is the same route written as
 * a code:
 *
 *   https://links.example.com/imbwmum/1007100
 *
 * Nothing in that URL says "order", and nothing about the code can be worked
 * out on the device. An app parsing the path itself sees a first segment it has
 * never heard of and does nothing, so the link opens the app and then appears
 * to fail, which is the quietest way a link can break: no error, no screen, no
 * clue. Short links are what a dashboard offers for sharing and what a QR code
 * carries, so this is not a rare path.
 *
 * `resolve` asks the platform, which answers with the route, the token and the
 * canonical path, and the app can route that the way it routes anything else.
 * A readable URL comes back unchanged, so an app can simply resolve everything
 * rather than guessing which kind it has.
 */
export class Links {
  constructor(private client: HttpClient) {}

  /**
   * What this link means, or null if it means nothing here.
   *
   * `url` is a whole link as the app received it. The question goes to the
   * link's own host, because that is how the platform knows which Appspace is
   * being asked about, which also means a link on a domain that is not yours
   * simply answers nothing.
   *
   * Never throws. A link that cannot be resolved, for a bad network or any
   * other reason, is one the app should fall back to its own handling for, and
   * an exception in the middle of a cold start is no way to say so.
   */
  async resolve(url: string): Promise<ResolvedLink | null> {
    if (!url || typeof url !== 'string') return null;

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      debugWarn(`Links.resolve: not a URL: ${url}`);
      return null;
    }

    // http and https only. A custom scheme link already carries the path the
    // app wants, and anything else is not a link this could answer for.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

    try {
      const result = await this.client.postPublicToOrigin<ResolvedLink>(
        parsed.origin,
        '/v1/api/path',
        { path: parsed.pathname },
      );
      return result && result.route ? result : null;
    } catch (err) {
      debugWarn(`Links.resolve failed: ${(err as Error).message}`);
      return null;
    }
  }
}
