import type { ResolvedTolinkuConfig } from './types';
import { SDK_VERSION } from './types';
import { debugLog } from './debug';

/** Maximum number of retry attempts after the initial request. */
const MAX_RETRIES = 3;
/** Base delay in milliseconds before the first retry. */
const BASE_DELAY_MS = 500;
/** Maximum random jitter added to each retry delay, in milliseconds. */
const MAX_JITTER_MS = 250;

/**
 * Whether a caught value is an abort, from either the timeout or destroy().
 *
 * Read off the name rather than tested with `instanceof DOMException`. React
 * Native has no DOM, so whether `DOMException` exists as a global at all
 * depends on the engine and on which AbortController implementation is in
 * play: Hermes supplies its own, a polyfill supplies another, and neither is
 * obliged to reject with a real DOMException. The name is the one part every
 * implementation agrees on, including the browser's. The previous check
 * compiled only because React Native's older type definitions pulled DOM
 * globals in behind our backs, and it would have quietly stopped recognising
 * a timeout on any engine without that global.
 */
function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  /** Set of AbortControllers for in-flight requests. Used by destroy() to cancel all. */
  private pendingControllers: Set<AbortController> = new Set();
  private destroyed = false;

  constructor(config: ResolvedTolinkuConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = this.baseUrl + path;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
    }

    return this.executeWithRetry<T>(url, {
      method: 'GET',
      headers: this.authenticatedHeaders(),
    });
  }

  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.executeWithRetry<T>(this.baseUrl + path, {
      method: 'POST',
      headers: {
        ...this.authenticatedHeaders(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** GET without API key auth (for public endpoints like deferred claim) */
  async getPublic<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = this.baseUrl + path;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += '?' + qs;
    }

    return this.executeWithRetry<T>(url, {
      method: 'GET',
      headers: this.publicHeaders(),
    });
  }

  /**
   * POST to a host other than the configured one, without the API key.
   *
   * A few public endpoints work out which Appspace they belong to from the
   * hostname the request arrived on rather than from a key or an id, so a
   * question about a link on a customer's own domain has to be asked on that
   * domain. Everything else about the request is unchanged: same timeout, same
   * retries, same headers.
   */
  async postPublicToOrigin<T>(origin: string, path: string, body?: Record<string, unknown>): Promise<T> {
    return this.executeWithRetry<T>(origin.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: {
        ...this.publicHeaders(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * The hostname of the configured API, lowercased and without a port, for
   * telling whether some other URL points at the same host. Empty if the base
   * URL cannot be read, which init's validation should already have ruled out.
   */
  get apiHostname(): string {
    const match = /^https?:\/\/(?:[^/?#@]*@)?([^/?#]+)/i.exec(this.baseUrl);
    return match ? hostnameOf(match[1]!) : '';
  }

  /** Whether there is a key to send, so callers can skip a call that would only be refused. */
  get hasApiKey(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  /**
   * POST once, without the API key, to a host other than the configured one,
   * and hand back whatever came back, whatever the status.
   *
   * For a question that must not be asked twice: no retries, and its own time
   * limit rather than the client's. Throws only when there is no reply at all
   * (a network failure, the time limit, or a destroyed client).
   */
  async postPublicOnceToOrigin(
    origin: string,
    path: string,
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<OnceReply> {
    return this.executeOnce(origin.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: {
        ...this.publicHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, timeoutMs);
  }

  /**
   * POST once, with the API key, to the configured API. Same terms as
   * {@link postPublicOnceToOrigin}: one attempt, its own time limit, the reply
   * handed back whatever its status.
   */
  async postOnce(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<OnceReply> {
    return this.executeOnce(this.baseUrl + path, {
      method: 'POST',
      headers: {
        ...this.authenticatedHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, timeoutMs);
  }

  /** POST without API key auth (for public endpoints like deferred claim) */
  async postPublic<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.executeWithRetry<T>(this.baseUrl + path, {
      method: 'POST',
      headers: {
        ...this.publicHeaders(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Abort all in-flight requests and mark the client as destroyed.
   * After calling this, all future requests will throw immediately.
   */
  abort(): void {
    this.destroyed = true;
    for (const controller of this.pendingControllers) {
      controller.abort();
    }
    this.pendingControllers.clear();
  }

  private authenticatedHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
      'User-Agent': `TolinkuReactNativeSDK/${SDK_VERSION}`,
    };
  }

  private publicHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'User-Agent': `TolinkuReactNativeSDK/${SDK_VERSION}`,
    };
  }

  /**
   * One request, one attempt, aborted after `timeoutMs`. The body is read as
   * JSON when it is JSON and left undefined when it is not, so the caller can
   * tell a reply from our own server apart from somebody else's error page.
   */
  private async executeOnce(url: string, init: RequestInit, timeoutMs: number): Promise<OnceReply> {
    if (this.destroyed) {
      throw new TolinkuError('Tolinku: client has been destroyed. Call Tolinku.init() to reinitialize.', 0);
    }

    const controller = new AbortController();
    this.pendingControllers.add(controller);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        body = undefined;
      }
      // X-Tolinku: 1 is on every answer Tolinku's own API gives; another host won't send it.
      return { status: res.status, body, tolinku: res.headers?.get?.('X-Tolinku') === '1' };
    } catch (err) {
      if (this.destroyed) {
        throw new TolinkuError('Tolinku: request aborted (client destroyed).', 0);
      }
      if (isAbortError(err)) {
        throw new TolinkuError(`Tolinku: request timed out after ${timeoutMs}ms`, 0);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      this.pendingControllers.delete(controller);
    }
  }

  /**
   * Execute a fetch request with retry logic. Retries on:
   * - Network errors (fetch throws)
   * - HTTP 429 (Too Many Requests), respecting the Retry-After header
   * - HTTP 5xx (server errors)
   *
   * Does NOT retry on 4xx errors (except 429).
   * Uses exponential backoff: BASE_DELAY_MS * 2^attempt + random jitter (0..MAX_JITTER_MS).
   */
  private async executeWithRetry<T>(
    url: string,
    init: RequestInit
  ): Promise<T> {
    if (this.destroyed) {
      throw new TolinkuError('Tolinku: client has been destroyed. Call Tolinku.init() to reinitialize.', 0);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      this.pendingControllers.add(controller);

      // Set up timeout
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        this.pendingControllers.delete(controller);

        if (res.ok) {
          return res.json();
        }

        // Parse error body
        const errorBody = await res.json().catch(() => ({ error: res.statusText }));
        const errorMessage = errorBody.error || res.statusText;
        const errorCode = errorBody.code;

        // Determine if we should retry
        const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw new TolinkuError(errorMessage, res.status, errorCode);
        }

        lastError = new TolinkuError(errorMessage, res.status, errorCode);

        // Calculate delay: respect Retry-After for 429, otherwise exponential backoff
        let delayMs: number;
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
          if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
            delayMs = retryAfterSeconds * 1000;
          } else {
            delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
          }
        } else {
          delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        }

        const jitter = Math.random() * MAX_JITTER_MS;
        const totalDelay = delayMs + jitter;

        debugLog(`Retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(totalDelay)}ms (status=${res.status})`);

        await sleep(totalDelay);
      } catch (err) {
        clearTimeout(timeoutId);
        this.pendingControllers.delete(controller);

        // If the client was destroyed, rethrow immediately
        if (this.destroyed) {
          throw new TolinkuError('Tolinku: request aborted (client destroyed).', 0);
        }

        // AbortController timeout
        if (isAbortError(err)) {
          const timeoutErr = new TolinkuError(`Tolinku: request timed out after ${this.timeout}ms`, 0);
          if (attempt === MAX_RETRIES) throw timeoutErr;
          lastError = timeoutErr;
        } else if (err instanceof TolinkuError) {
          // Already a TolinkuError (from the non-retryable branch above); rethrow
          throw err;
        } else {
          // Network error; retry
          if (attempt === MAX_RETRIES) {
            throw new TolinkuError(
              `Tolinku: network error after ${MAX_RETRIES + 1} attempts: ${(err as Error).message}`,
              0
            );
          }
          lastError = err as Error;
        }

        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * MAX_JITTER_MS;
        const totalDelay = delayMs + jitter;

        debugLog(`Retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(totalDelay)}ms (${(err as Error).message})`);

        await sleep(totalDelay);
      }
    }

    // Should not reach here, but just in case
    throw lastError || new TolinkuError('Tolinku: request failed after retries', 0);
  }
}

/** A reply to a single attempt: its status, its body if that was JSON, and whether Tolinku marked it as its own (X-Tolinku: 1). */
export interface OnceReply {
  status: number;
  body: unknown;
  tolinku?: boolean;
}

/** The hostname of a host[:port] authority, lowercased, without the port. */
export function hostnameOf(authority: string): string {
  const match = /^(\[[^\]]*\]|[^:]*)/.exec(authority);
  return (match ? match[1]! : authority).toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TolinkuError extends Error {
  status: number;
  code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'TolinkuError';
    this.status = status;
    this.code = code;
  }
}
