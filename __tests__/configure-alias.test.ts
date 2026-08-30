import { Tolinku } from '../src/Tolinku';

/**
 * `configure` is the name the Android, iOS and Flutter SDKs use to initialise.
 * This package shipped it as `init`. Both work so that code moved between
 * platforms compiles, and `init` is meant for deprecation only once moving off
 * it is a one-line change rather than a surprise.
 *
 * An alias is worth having only while it stays identical, so these compare the
 * resulting state rather than trusting that one still calls the other.
 */

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const CONFIG = { apiKey: 'tolk_pub_test_key', baseUrl: 'https://api.test.com' };

describe('configure as an alias for init', () => {
  afterEach(async () => {
    if (Tolinku.isConfigured()) await Tolinku.destroy();
  });

  it('configures the SDK the same way init does', () => {
    Tolinku.configure(CONFIG);
    expect(Tolinku.isConfigured()).toBe(true);
  });

  it('produces the same client as init', async () => {
    Tolinku.init(CONFIG);
    const viaInit = Tolinku.getClient();
    const initBaseUrl = (viaInit as unknown as { baseUrl: string }).baseUrl;
    await Tolinku.destroy();

    Tolinku.configure(CONFIG);
    const viaConfigure = Tolinku.getClient();
    expect((viaConfigure as unknown as { baseUrl: string }).baseUrl).toBe(initBaseUrl);
  });

  it('rejects a missing apiKey exactly as init does', () => {
    expect(() => Tolinku.configure({ apiKey: '' } as never)).toThrow(/apiKey/);
    expect(() => Tolinku.init({ apiKey: '' } as never)).toThrow(/apiKey/);
  });

  it('is subject to the same double-configure guard', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    Tolinku.configure(CONFIG);
    Tolinku.configure(CONFIG);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
