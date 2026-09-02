import { isSafeUrl, validateBaseUrl, validateEventType } from '../src/validation';

/**
 * `isSafeUrl` decides whether a URL from message content may be opened or
 * rendered. It guards three call sites (image, background image, button action),
 * and from 0.4.1 the button guard runs before the caller's own `onButtonPress`
 * handler as well, matching the Android and Flutter SDKs: a handler is ordinary
 * app code that will reasonably pass the value to `Linking.openURL` unexamined.
 *
 * It had no tests of its own until now.
 */
describe('isSafeUrl', () => {
  it('allows the two web schemes', () => {
    expect(isSafeUrl('https://example.com/promo')).toBe(true);
    expect(isSafeUrl('http://example.com/promo')).toBe(true);
  });

  it('blocks schemes that do something other than open a page', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('content://com.other.app/data')).toBe(false);
    expect(isSafeUrl('intent://scan/#Intent;scheme=zxing;end')).toBe(false);
  });

  it('is not fooled by the case of the scheme', () => {
    expect(isSafeUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('HTTPS://example.com')).toBe(true);
  });

  it('blocks a scheme hidden behind leading whitespace', () => {
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('\tfile:///etc/passwd')).toBe(false);
  });

  it('treats empty or missing input as unsafe', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl(undefined as unknown as string)).toBe(false);
    expect(isSafeUrl(null as unknown as string)).toBe(false);
  });

  it('refuses rather than throwing on something that will not parse', () => {
    expect(() => isSafeUrl('ht!tp://[bad')).not.toThrow();
    expect(isSafeUrl('ht!tp://[bad')).toBe(false);
  });
});

describe('validateBaseUrl', () => {
  it('accepts HTTPS', () => {
    expect(() => validateBaseUrl('https://api.tolinku.com')).not.toThrow();
  });

  it('rejects plain HTTP, which would put the API key on the wire', () => {
    expect(() => validateBaseUrl('http://api.tolinku.com')).toThrow(/HTTPS/);
  });

  it('exempts local development addresses', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://10.0.2.2:3000',
      'http://192.168.1.10:3000',
      'http://172.16.0.5:3000',
    ]) {
      expect(() => validateBaseUrl(url)).not.toThrow();
    }
  });

  it('does not exempt a public address that merely looks local', () => {
    // 172.32.x is outside the private range, unlike 172.16 to 172.31.
    expect(() => validateBaseUrl('http://172.32.0.1')).toThrow(/HTTPS/);
  });
});

describe('validateEventType', () => {
  it('adds the custom prefix when it is missing', () => {
    expect(validateEventType('signup')).toBe('custom.signup');
    expect(validateEventType('custom.signup')).toBe('custom.signup');
  });

  it('rejects a name the server will not accept', () => {
    expect(() => validateEventType('custom.Sign Up')).toThrow();
    expect(() => validateEventType('')).toThrow();
  });
});
