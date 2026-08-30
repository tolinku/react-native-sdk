// react-native is mocked before importing the SDK: Platform.OS gates the
// referrer lookup, since there is no Play Store on iOS.
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
}));

import { parseInstallReferrer } from '../src/install-referrer';

/**
 * The Play referrer is a shared string: a developer's own campaign parameters
 * sit beside ours, so the token has to be found among the pairs rather than
 * taken as the whole value.
 */
describe('parseInstallReferrer', () => {
  it('reads the token when it is the only pair', () => {
    expect(parseInstallReferrer('tolk_token=ABC123')).toBe('ABC123');
  });

  it("reads the token beside a developer's own parameters", () => {
    expect(parseInstallReferrer('utm_source=newsletter&tolk_token=ABC123&utm_medium=email'))
      .toBe('ABC123');
  });

  it('reads the token when it is last', () => {
    expect(parseInstallReferrer('utm_source=x&tolk_token=ABC123')).toBe('ABC123');
  });

  it('tolerates a percent encoded referrer', () => {
    expect(parseInstallReferrer('tolk_token%3DABC123')).toBe('ABC123');
  });

  it('returns null for an organic install', () => {
    expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
  });

  it('returns null for nothing at all', () => {
    expect(parseInstallReferrer(null)).toBeNull();
    expect(parseInstallReferrer(undefined)).toBeNull();
    expect(parseInstallReferrer('')).toBeNull();
    expect(parseInstallReferrer('   ')).toBeNull();
  });

  it('returns null rather than an empty token', () => {
    expect(parseInstallReferrer('tolk_token=')).toBeNull();
    expect(parseInstallReferrer('utm_source=x&tolk_token=&utm_medium=y')).toBeNull();
  });

  it('does not mistake a similarly named parameter for ours', () => {
    expect(parseInstallReferrer('my_tolk_token=NOPE')).toBeNull();
    expect(parseInstallReferrer('tolk_token_other=NOPE')).toBeNull();
  });

  it('survives malformed percent encoding', () => {
    expect(parseInstallReferrer('tolk_token=ABC%ZZ')).toBe('ABC%ZZ');
  });
});

/**
 * The auto-detection glue. Shape verified against
 * react-native-play-install-referrer@2.0.1: it exports
 * `{ PlayInstallReferrer }`, whose `getInstallReferrerInfo(cb)` calls back with
 * `(info, error)` and reports the string on `info.installReferrer`.
 */
describe('getInstallReferrerToken', () => {
  const load = () => require('../src/install-referrer').getInstallReferrerToken;

  const withNative = (impl: unknown) =>
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: { TolinkuInstallReferrer: impl },
    }));

  beforeEach(() => jest.resetModules());
  afterEach(() => jest.resetModules());

  it('reads the referrer from our native module', async () => {
    withNative({
      getInstallReferrer: async () => 'utm_source=x&tolk_token=FROM_PLAY',
    });
    await expect(load()()).resolves.toBe('FROM_PLAY');
  });

  it('returns null when Play has nothing to report', async () => {
    withNative({ getInstallReferrer: async () => null });
    await expect(load()()).resolves.toBeNull();
  });

  it('returns null when the native module was not built in, as in Expo Go', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {},
    }));
    await expect(load()()).resolves.toBeNull();
  });

  it('does not touch NativeModules at import time', () => {
    // Accessing it during module evaluation would crash where it is absent.
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      get NativeModules(): never {
        throw new Error('NativeModules read at import time');
      },
    }));
    expect(() => require('../src/install-referrer')).not.toThrow();
  });

  it('prefers an explicitly supplied provider', async () => {
    withNative({ getInstallReferrer: async () => 'tolk_token=NATIVE' });
    await expect(load()(async () => 'tolk_token=EXPLICIT')).resolves.toBe('EXPLICIT');
  });

  it('never throws when the native call rejects', async () => {
    withNative({ getInstallReferrer: async () => { throw new Error('boom'); } });
    await expect(load()()).resolves.toBeNull();
  });

  it('skips the lookup entirely on iOS', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      NativeModules: {},
    }));
    const spy = jest.fn();
    await expect(load()(spy)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
