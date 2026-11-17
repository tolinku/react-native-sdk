const linkingListeners: Array<(e: { url: string }) => void> = [];
const removeSpy = jest.fn();
let initialUrl: string | null = null;

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: 'ios' },
  Linking: {
    getInitialURL: jest.fn(() => Promise.resolve(initialUrl)),
    addEventListener: jest.fn((_event: string, cb: (e: { url: string }) => void) => {
      linkingListeners.push(cb);
      return { remove: removeSpy };
    }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));

import { Tolinku } from '../src/Tolinku';

/**
 * Automatic link reporting, which is off unless the app asks for it.
 *
 * Off by default is the whole point: a reported open is billed as a click, so
 * an SDK that started reporting on upgrade would raise somebody's bill without
 * them choosing to. Nothing here is worth as much as that staying true.
 *
 * The other thing worth holding is that BOTH arrival paths are wired. A link
 * that launches the app cold arrives at getInitialURL; one tapped while it is
 * already running arrives at the listener. Wiring only the second is the common
 * mistake, and it passes every test done by hand with the app already open.
 */
describe('automatic link reporting', () => {
  beforeEach(async () => {
    linkingListeners.length = 0;
    removeSpy.mockClear();
    initialUrl = null;
    if (Tolinku.isConfigured()) await Tolinku.destroy();
    jest.spyOn(Tolinku, 'trackLinkOpen').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (Tolinku.isConfigured()) await Tolinku.destroy();
    jest.restoreAllMocks();
  });

  it('reports nothing when the app has not asked for it', async () => {
    initialUrl = 'https://links.example.com/merchant/abc';
    Tolinku.init({ apiKey: 'tolk_pub_k' });
    await Promise.resolve();
    expect(linkingListeners).toHaveLength(0);
    expect(Tolinku.trackLinkOpen).not.toHaveBeenCalled();
  });

  it('reports nothing when the flag is explicitly false', async () => {
    initialUrl = 'https://links.example.com/merchant/abc';
    Tolinku.init({ apiKey: 'tolk_pub_k', autoTrackLinkOpens: false });
    await Promise.resolve();
    expect(Tolinku.trackLinkOpen).not.toHaveBeenCalled();
  });

  it('reports the link that launched the app', async () => {
    initialUrl = 'https://links.example.com/merchant/abc';
    Tolinku.init({ apiKey: 'tolk_pub_k', autoTrackLinkOpens: true });
    await new Promise(r => setImmediate(r));
    expect(Tolinku.trackLinkOpen).toHaveBeenCalledWith('https://links.example.com/merchant/abc');
  });

  it('reports a link tapped while the app was already running', async () => {
    Tolinku.init({ apiKey: 'tolk_pub_k', autoTrackLinkOpens: true });
    await new Promise(r => setImmediate(r));
    expect(linkingListeners).toHaveLength(1);
    linkingListeners[0]!({ url: 'https://links.example.com/promo/xyz' });
    expect(Tolinku.trackLinkOpen).toHaveBeenCalledWith('https://links.example.com/promo/xyz');
  });

  it('says nothing when the app was not launched by a link', async () => {
    initialUrl = null;
    Tolinku.init({ apiKey: 'tolk_pub_k', autoTrackLinkOpens: true });
    await new Promise(r => setImmediate(r));
    expect(Tolinku.trackLinkOpen).not.toHaveBeenCalled();
  });

  it('survives a launch URL that cannot be read', async () => {
    const { Linking } = jest.requireMock('react-native');
    Linking.getInitialURL.mockRejectedValueOnce(new Error('no'));
    expect(() => Tolinku.init({ apiKey: 'tolk_pub_k', autoTrackLinkOpens: true })).not.toThrow();
    await new Promise(r => setImmediate(r));
  });

  it('takes the listener back down on destroy', async () => {
    Tolinku.init({ apiKey: 'tolk_pub_k', autoTrackLinkOpens: true });
    await new Promise(r => setImmediate(r));
    await Tolinku.destroy();
    // Left attached, a reconfigured SDK would report every link twice.
    expect(removeSpy).toHaveBeenCalled();
  });
});
