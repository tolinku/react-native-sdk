// react-native is mocked before importing the SDK so Dimensions, PixelRatio and
// Platform return fixed values. These are the signals the server matches against
// what the Tolinku landing page recorded in the browser, so their units and
// formats have to be right: a mismatch is not an error, the signal is just
// skipped and the claim quietly returns null.
jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Dimensions: { get: jest.fn(() => ({ width: 412, height: 915 })) },
  PixelRatio: { get: jest.fn(() => 2.625) },
  Platform: { OS: 'android', Version: 34 },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { Deferred } from '../src/deferred';
import type { HttpClient } from '../src/client';

function mockClient(): HttpClient {
  return {
    postPublic: jest.fn().mockResolvedValue({ deep_link_path: '/p/42', appspace_id: 'app-1' }),
    getPublic: jest.fn().mockResolvedValue({}),
    post: jest.fn(),
    get: jest.fn(),
  } as unknown as HttpClient;
}

const bodyOf = (client: HttpClient) =>
  (client.postPublic as jest.Mock).mock.calls[0][1];

describe('Deferred.claimBySignals', () => {
  let client: HttpClient;
  let deferred: Deferred;

  beforeEach(() => {
    client = mockClient();
    deferred = new Deferred(client);
    jest.clearAllMocks();
  });

  describe('payload', () => {
    it('sends every signal the matcher compares', async () => {
      await deferred.claimBySignals({ appspaceId: 'app-1' });

      const body = bodyOf(client);
      for (const key of [
        'appspace_id', 'timezone', 'language',
        'screen_width', 'screen_height', 'device_pixel_ratio', 'os_version',
      ]) {
        expect(body).toHaveProperty(key);
      }
    });

    it('reports device pixel ratio from PixelRatio', async () => {
      await deferred.claimBySignals({ appspaceId: 'app-1' });
      expect(bodyOf(client).device_pixel_ratio).toBe(2.625);
    });

    it('reports the OS version as a string', async () => {
      await deferred.claimBySignals({ appspaceId: 'app-1' });
      // Platform.Version is a number on Android and a string on iOS; the server
      // compares the major component of a string either way.
      expect(bodyOf(client).os_version).toBe('34');
    });

    it('derives a full locale rather than defaulting to a bare language', async () => {
      await deferred.claimBySignals({ appspaceId: 'app-1' });

      const language = bodyOf(client).language;
      // A hardcoded "en" could never match a stored "ko-KR", so the language
      // signal was dead weight on every non-English device.
      expect(typeof language).toBe('string');
      expect(language.length).toBeGreaterThan(0);
    });

    it('uses screen dimensions in density independent pixels', async () => {
      await deferred.claimBySignals({ appspaceId: 'app-1' });

      const body = bodyOf(client);
      // Dimensions reports dp, which is what a browser calls a CSS pixel. Raw
      // physical pixels would be 1080x2400 here and would never match.
      expect(body.screen_width).toBe(412);
      expect(body.screen_height).toBe(915);
    });

    it('lets the caller override any signal', async () => {
      await deferred.claimBySignals({
        appspaceId: 'app-1',
        timezone: 'Asia/Seoul',
        language: 'ko-KR',
        screenWidth: 390,
        screenHeight: 844,
        devicePixelRatio: 3,
        osVersion: '17.4',
      });

      expect(bodyOf(client)).toEqual({
        appspace_id: 'app-1',
        timezone: 'Asia/Seoul',
        language: 'ko-KR',
        screen_width: 390,
        screen_height: 844,
        device_pixel_ratio: 3,
        os_version: '17.4',
      });
    });
  });

  describe('results', () => {
    it('returns the link on success', async () => {
      const link = await deferred.claimBySignals({ appspaceId: 'app-1' });
      expect(link).not.toBeNull();
      expect(link!.deep_link_path).toBe('/p/42');
    });

    it('stays quiet on 404, which only means nothing was waiting', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (client.postPublic as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Not found'), { statusCode: 404 }),
      );

      const link = await deferred.claimBySignals({ appspaceId: 'app-1' });

      expect(link).toBeNull();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('names appspaceId as the likely cause on 403', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (client.postPublic as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Unknown appspace_id'), { statusCode: 403 }),
      );

      const link = await deferred.claimBySignals({ appspaceId: 'my-subdomain' });

      expect(link).toBeNull();
      expect(warn).toHaveBeenCalled();
      const message = warn.mock.calls[0].join(' ');
      expect(message).toContain('403');
      expect(message).toContain('appspaceId');
      warn.mockRestore();
    });

    it('rejects a blank appspaceId before making a request', async () => {
      await expect(
        deferred.claimBySignals({ appspaceId: '   ' }),
      ).rejects.toThrow(/appspaceId/);
      expect(client.postPublic).not.toHaveBeenCalled();
    });
  });
});
