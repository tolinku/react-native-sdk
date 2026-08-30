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

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
  });
  afterEach(() => jest.resetModules());

  it('reads the token from the installed package', async () => {
    jest.doMock(
      'react-native-play-install-referrer',
      () => ({
        PlayInstallReferrer: {
          getInstallReferrerInfo: (cb: (i: unknown, e: unknown) => void) =>
            cb({ installReferrer: 'utm_source=x&tolk_token=FROM_PLAY' }, null),
        },
      }),
      { virtual: true },
    );
    await expect(load()()).resolves.toBe('FROM_PLAY');
  });

  it('returns null when Play reports an error', async () => {
    jest.doMock(
      'react-native-play-install-referrer',
      () => ({
        PlayInstallReferrer: {
          getInstallReferrerInfo: (cb: (i: unknown, e: unknown) => void) =>
            cb(null, { message: 'SERVICE_UNAVAILABLE', responseCode: 1 }),
        },
      }),
      { virtual: true },
    );
    await expect(load()()).resolves.toBeNull();
  });

  it('falls back to null when no referrer package is installed', async () => {
    await expect(load()()).resolves.toBeNull();
  });

  it('prefers an explicitly supplied provider', async () => {
    await expect(load()(async () => 'tolk_token=EXPLICIT')).resolves.toBe('EXPLICIT');
  });

  it('never throws when the provider does', async () => {
    await expect(load()(() => { throw new Error('boom'); })).resolves.toBeNull();
  });

  it('skips the lookup entirely on iOS', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    const spy = jest.fn();
    await expect(load()(spy)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
