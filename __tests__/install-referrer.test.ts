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
