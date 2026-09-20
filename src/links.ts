import type { HttpClient } from './client';
import type { ResolvedLink } from './types';
import { debugWarn } from './debug';
import { parseHttpUrl } from './validation';

/**
 * Working out what a link the operating system handed the app actually means.
 *
 * An app receives the URL that was tapped, exactly as it was written. That is
 * fine while the URL is readable: `/order/4821` says "order" and the app can
 * route it. It is not fine for a short link, which is the same route written as
 * a code:
 *
 *   https://links.example.com/s7k2p9q/4821
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
/**
 * Whether the platform's answer is the path it promises to be.
 *
 * `resolve` sends its question to a host taken from the URL it was given, so an
 * app resolving a link from somewhere it does not control is talking to a
 * stranger. The contract is a path and nothing else: a full URL, or a protocol
 * relative "//host" that reads as one, is a redirect waiting to happen in
 * whatever the app does with it next.
 */
function isRoutablePath(path: unknown): path is string {
  return typeof path === 'string'
    && path.startsWith('/')
    && !path.startsWith('//');
}

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

    // Parsed here rather than with the platform's URL: React Native's own URL
    // throws from origin and protocol on most of the versions this package
    // supports, and the throw landed inside the catch below, so a perfectly
    // good link came back as "not a URL" on device while every test passed.
    //
    // http and https only. A custom scheme link already carries the path the
    // app wants, and anything else is not a link this could answer for.
    const parsed = parseHttpUrl(url);
    if (!parsed) {
      debugWarn(`Links.resolve: not an http(s) URL: ${url}`);
      return null;
    }

    try {
      const result = await this.client.postPublicToOrigin<ResolvedLink>(
        parsed.origin,
        '/v1/api/path',
        { path: parsed.pathname },
      );
      if (!result || !result.route || !isRoutablePath(result.deep_link_path)) return null;
      return result;
    } catch (err) {
      debugWarn(`Links.resolve failed: ${(err as Error).message}`);
      return null;
    }
  }
}
