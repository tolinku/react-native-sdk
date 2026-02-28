/**
 * Check if a URL is safe to open or render. Only allows http: and https: protocols.
 * Blocks javascript:, data:, file:, and other potentially dangerous protocols.
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  // Trim whitespace to prevent bypass via leading spaces
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    // If URL cannot be parsed, it's not safe to open
    return false;
  }
}

/**
 * Validate that a base URL uses HTTPS, with exceptions for local development.
 * Throws an error if the URL is invalid.
 */
export function validateBaseUrl(baseUrl: string): void {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Tolinku: baseUrl must be a non-empty string.');
  }

  const trimmed = baseUrl.trim();

  // Allow local development URLs over HTTP
  const isLocalDev =
    trimmed.startsWith('http://localhost') ||
    trimmed.startsWith('http://127.0.0.1') ||
    trimmed.startsWith('http://10.') ||
    /^http:\/\/172\.(1[6-9]|2\d|3[01])\./.test(trimmed) ||
    trimmed.startsWith('http://192.168.');

  if (trimmed.startsWith('https://')) {
    return; // Valid HTTPS URL
  }

  if (isLocalDev) {
    return; // Valid local development URL
  }

  throw new Error(
    'Tolinku: baseUrl must use HTTPS to protect your API key. Use https:// instead of http://. ' +
    'Local development URLs (localhost, 127.0.0.1, 10.x, 172.16-31.x, 192.168.x) are exempt from this requirement.'
  );
}

/** Regex for valid custom event names (after the "custom." prefix) */
const EVENT_NAME_REGEX = /^custom\.[a-z0-9_]+$/;

/**
 * Validate and normalize an event type name.
 * Auto-prefixes with "custom." if missing.
 * Throws a descriptive error if the name is invalid.
 */
export function validateEventType(eventType: string): string {
  if (!eventType || typeof eventType !== 'string' || !eventType.trim()) {
    throw new Error('Tolinku: eventType must be a non-empty string.');
  }

  let normalized = eventType.trim();

  // Auto-prefix with "custom." if not present
  if (!normalized.startsWith('custom.')) {
    normalized = 'custom.' + normalized;
  }

  if (!EVENT_NAME_REGEX.test(normalized)) {
    throw new Error(
      `Tolinku: invalid event type "${normalized}". ` +
      'Event names must match the pattern "custom.[a-z0-9_]+". ' +
      'Use only lowercase letters, digits, and underscores after the "custom." prefix.'
    );
  }

  return normalized;
}
