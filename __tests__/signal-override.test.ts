jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: 'ios', Version: '17.1' },
  PixelRatio: { get: () => 3 },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Linking: { getInitialURL: jest.fn(), addEventListener: jest.fn() },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { Deferred } from '../src/deferred';
import { HttpClient } from '../src/client';

/**
 * Signals passed to `claimBySignals` override what the device reports.
 *
 * The case worth holding is a blank one. An unset configuration value and a
 * failed lookup both arrive as an empty or whitespace string, and taking one
 * literally would replace a good value with one the matcher cannot use. A signal
 * that is present and disagrees counts against the match, where an absent one is
 * skipped, so a blank override is worse than no override at all.
 */
describe('signal overrides', () => {
  let fetchMock: jest.Mock;

  const body = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  const deferred = () =>
    new Deferred(
      new HttpClient({
        apiKey: 'tolk_pub_test',
        baseUrl: 'https://links.example.com',
        debug: false,
        timeout: 5000,
      }),
    );

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'not found' }),
      text: async () => '{"error":"not found"}',
    });
    (global as never as { fetch: jest.Mock }).fetch = fetchMock;
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends what the device reports when nothing is passed', async () => {
    await deferred().claimBySignals({ appspaceId: 'app123' });

    expect(body().screen_width).toBe(390);
    expect(body().device_pixel_ratio).toBe(3);
  });

  it('a passed signal wins', async () => {
    await deferred().claimBySignals({ appspaceId: 'app123', timezone: 'Asia/Seoul' });

    expect(body().timezone).toBe('Asia/Seoul');
  });

  it('a blank override does not discard what the device reported', async () => {
    await deferred().claimBySignals({
      appspaceId: 'app123',
      timezone: '',
      language: '   ',
    });

    expect(body().timezone).toBeTruthy();
    expect(body().timezone).not.toBe('');
    expect(body().language).not.toBe('   ');
  });

  it('a non-positive measurement does not discard what was reported', async () => {
    await deferred().claimBySignals({
      appspaceId: 'app123',
      screenWidth: 0,
      devicePixelRatio: -1,
    });

    expect(body().screen_width).toBe(390);
    expect(body().device_pixel_ratio).toBe(3);
  });

  it('overriding one signal keeps the rest', async () => {
    // Matching compares only what both sides supplied, so dropping the others
    // would leave less to compare on than passing nothing at all.
    await deferred().claimBySignals({ appspaceId: 'app123', timezone: 'Asia/Seoul' });

    expect(body().screen_width).toBe(390);
    expect(body().device_pixel_ratio).toBe(3);
    expect(body().os_version).toBeTruthy();
  });

  it('trims a real override', async () => {
    await deferred().claimBySignals({
      appspaceId: 'app123',
      timezone: '  Asia/Seoul  ',
    });

    expect(body().timezone).toBe('Asia/Seoul');
  });
});
