import type { HttpClient, OnceReply } from './client';
import type { ResolvedLink } from './types';
import { debugWarn } from './debug';

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

/**
 * How long either question may take. Short on purpose: this runs while the
 * app is opening, and a link that cannot be resolved in time falls back to the
 * app's own handling rather than holding the first screen.
 */
const RESOLVE_TIMEOUT_MS = 5000;

/** A link in the one form every request uses. */
interface NormalisedLink {
  /** `https://host[:port]`, lowercased, with no default port. */
  origin: string;
  /** The hostname alone, lowercased, without the port. */
  hostname: string;
  /** The path exactly as written (percent-encoding unchanged), or "/". */
  path: string;
  /** origin + path + "?query", without the fragment. */
  whole: string;
}

/**
 * Put a link in one form, once, so the question to the link's host and the
 * question to the API describe the same link.
 *
 * Trimmed; the fragment dropped (it never reaches a server, and it is not part
 * of what was clicked as far as anyone counting clicks is concerned); scheme
 * and host lowercased; http upgraded to https, since every Tolinku and click
 * domain serves https and both iOS and Android block cleartext by default; a
 * default port (:443 or :80) dropped and any other kept. The path and query
 * are left exactly as they were, encoding and all.
 *
 * Parsed by hand rather than with the platform's URL: React Native's own URL
 * throws from origin and protocol on most of the versions this package
 * supports. http and https only; anything else is null.
 */
export function normaliseLink(url: string): NormalisedLink | null {
  if (!url || typeof url !== 'string') return null;
  const cleaned = url.replace(/[\t\n\r]/g, '').trim();

  const match = /^https?:\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i.exec(cleaned);
  if (!match) return null;
  const [, rawAuthority, rawPath, rawQuery] = match;

  // Credentials in a link are not something to pass along to anyone.
  const authority = rawAuthority!.slice(rawAuthority!.lastIndexOf('@') + 1);
  const hostPort = /^(\[[^\]]*\]|[^:]*)(?::(\d*))?$/.exec(authority);
  if (!hostPort || !hostPort[1]) return null;

  const hostname = hostPort[1].toLowerCase();
  const port = hostPort[2];
  const keepPort = port && port !== '443' && port !== '80' ? `:${port}` : '';

  const origin = `https://${hostname}${keepPort}`;
  const path = rawPath || '/';
  const query = rawQuery && rawQuery.length > 1 ? rawQuery : '';

  return { origin, hostname, path, whole: origin + path + query };
}

/** The answer in a reply, if it is a 200 carrying a routable path. */
function answerIn(reply: OnceReply): ResolvedLink | null {
  if (reply.status !== 200) return null;
  const result = reply.body as ResolvedLink | null | undefined;
  if (!result || typeof result !== 'object' || !result.route || !isRoutablePath(result.deep_link_path)) {
    return null;
  }
  return result;
}

/**
 * Whether a reply came from Tolinku itself: JSON with a string `error`, at any
 * status. That host is ours and has given its answer.
 */
function isTolinkuReply(reply: OnceReply): boolean {
  const body = reply.body;
  return typeof body === 'object'
    && body !== null
    && typeof (body as { error?: unknown }).error === 'string';
}

export class Links {
  constructor(private client: HttpClient) {}

  /**
   * What this link means, or null if it means nothing here.
   *
   * `url` is a whole link as the app received it. The question goes to the
   * link's own host, because that is how the platform knows which Appspace is
   * being asked about. If that host is not Tolinku's (no reply, or one that is
   * not ours), and it is not the API's own host, the question goes once more to
   * the configured API with the key: a link in an email arrives wrapped in the
   * email platform's click tracking domain, which knows nothing about routes,
   * and the API can unwrap it.
   *
   * Each question is asked once, with a five second limit. Asking a click
   * tracking host again would count the email click again.
   *
   * Never throws. A link that cannot be resolved, for a bad network or any
   * other reason, is one the app should fall back to its own handling for, and
   * an exception in the middle of a cold start is no way to say so.
   */
  async resolve(url: string): Promise<ResolvedLink | null> {
    try {
      return await this.resolveLink(url);
    } catch (err) {
      debugWarn(`Links.resolve failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async resolveLink(url: string): Promise<ResolvedLink | null> {
    // http and https only. A custom scheme link already carries the path the
    // app wants, and anything else is not a link this could answer for.
    const link = normaliseLink(url);
    if (!link) {
      debugWarn(`Links.resolve: not an http(s) URL: ${url}`);
      return null;
    }

    // The whole link goes along with the path. A link in an email has been
    // wrapped by the email platform's click tracking, and for some of them
    // (SendGrid's, for one) everything that identifies the real link is in the
    // query string, which the path alone leaves behind.
    const direct = await this.askOnce(
      () => this.client.postPublicOnceToOrigin(
        link.origin,
        '/v1/api/path',
        { path: link.path, url: link.whole },
        RESOLVE_TIMEOUT_MS,
      ),
      'Links.resolve',
    );
    if (direct) {
      const found = answerIn(direct);
      if (found) return found;
      // Tolinku's own "no": the host is ours and has answered. Asking the API
      // as well would count the click twice.
      if (isTolinkuReply(direct)) return null;
    }

    // No reply, or one that is not Tolinku's: the normal answer from a click
    // tracking domain that belongs to an email platform. Ask Tolinku's API,
    // which knows how to unwrap them.
    //
    // Not when the link is already on the API's host, since that would be the
    // same question asked twice, and not without a key, since the API would
    // only refuse it. This one does carry the key, which is safe because it
    // goes to the configured API rather than to the host the link named.
    const apiHostname = this.client.apiHostname;
    if (!this.client.hasApiKey || !apiHostname || link.hostname === apiHostname) {
      return null;
    }

    const fallback = await this.askOnce(
      () => this.client.postOnce('/v1/api/links/resolve', { url: link.whole }, RESOLVE_TIMEOUT_MS),
      'Links.resolve fallback',
    );
    return fallback ? answerIn(fallback) : null;
  }

  /** One request; null when there was no reply at all. */
  private async askOnce(request: () => Promise<OnceReply>, label: string): Promise<OnceReply | null> {
    try {
      return await request();
    } catch (err) {
      debugWarn(`${label} failed: ${(err as Error).message}`);
      return null;
    }
  }
}
