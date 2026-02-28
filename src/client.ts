import type { ResolvedTolinkuConfig } from './types';
import { SDK_VERSION } from './types';
import { debugLog } from './debug';

/** Maximum number of retry attempts after the initial request. */
const MAX_RETRIES = 3;
/** Base delay in milliseconds before the first retry. */
const BASE_DELAY_MS = 500;
/** Maximum random jitter added to each retry delay, in milliseconds. */
const MAX_JITTER_MS = 250;

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
        if (err instanceof DOMException && err.name === 'AbortError') {
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
