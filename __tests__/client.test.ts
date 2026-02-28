import { Tolinku } from '../src/Tolinku';
import { validateBaseUrl, validateEventType } from '../src/validation';

// Mock React Native modules that aren't available in Jest
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('Tolinku SDK', () => {
  beforeEach(() => {
    // Reset state between tests
    if (Tolinku.isConfigured()) {
      Tolinku.destroy();
    }
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    if (Tolinku.isConfigured()) {
      await Tolinku.destroy();
    }
  });

  describe('isConfigured()', () => {
    it('returns false before init', () => {
      expect(Tolinku.isConfigured()).toBe(false);
    });

    it('returns true after init', () => {
      Tolinku.init({ apiKey: 'tolk_pub_test_key' });
      expect(Tolinku.isConfigured()).toBe(true);
    });

    it('returns false after destroy', async () => {
      Tolinku.init({ apiKey: 'tolk_pub_test_key' });
      await Tolinku.destroy();
      expect(Tolinku.isConfigured()).toBe(false);
    });
  });

  describe('HTTPS enforcement', () => {
    it('accepts valid HTTPS URLs', () => {
      expect(() => validateBaseUrl('https://api.tolinku.com')).not.toThrow();
      expect(() => validateBaseUrl('https://example.com')).not.toThrow();
    });

    it('rejects plain HTTP URLs', () => {
      expect(() => validateBaseUrl('http://api.tolinku.com')).toThrow(/must use HTTPS/);
      expect(() => validateBaseUrl('http://example.com')).toThrow(/must use HTTPS/);
    });

    it('allows localhost exceptions', () => {
      expect(() => validateBaseUrl('http://localhost:3000')).not.toThrow();
      expect(() => validateBaseUrl('http://localhost')).not.toThrow();
    });

    it('allows 127.0.0.1 exception', () => {
      expect(() => validateBaseUrl('http://127.0.0.1:3000')).not.toThrow();
      expect(() => validateBaseUrl('http://127.0.0.1')).not.toThrow();
    });

    it('allows 10.x.x.x private IP exception', () => {
      expect(() => validateBaseUrl('http://10.0.0.1:3000')).not.toThrow();
      expect(() => validateBaseUrl('http://10.1.2.3')).not.toThrow();
    });

    it('allows 192.168.x.x private IP exception', () => {
      expect(() => validateBaseUrl('http://192.168.1.1:3000')).not.toThrow();
      expect(() => validateBaseUrl('http://192.168.0.100')).not.toThrow();
    });
  });

  describe('Event name validation', () => {
    it('accepts valid event names', () => {
      expect(validateEventType('custom.signup')).toBe('custom.signup');
      expect(validateEventType('custom.user_login')).toBe('custom.user_login');
      expect(validateEventType('custom.button_click_123')).toBe('custom.button_click_123');
    });

    it('auto-prefixes event names without "custom."', () => {
      expect(validateEventType('signup')).toBe('custom.signup');
      expect(validateEventType('user_login')).toBe('custom.user_login');
      expect(validateEventType('test_event_123')).toBe('custom.test_event_123');
    });

    it('rejects invalid event names', () => {
      expect(() => validateEventType('custom.UPPERCASE')).toThrow(/invalid event type/);
      expect(() => validateEventType('custom.has-dashes')).toThrow(/invalid event type/);
      expect(() => validateEventType('custom.has spaces')).toThrow(/invalid event type/);
      expect(() => validateEventType('custom.')).toThrow(/invalid event type/);
    });

    it('rejects empty or blank event names', () => {
      expect(() => validateEventType('')).toThrow(/must be a non-empty string/);
      expect(() => validateEventType('   ')).toThrow(/must be a non-empty string/);
    });
  });

  describe('Input validation', () => {
    beforeEach(() => {
      Tolinku.init({ apiKey: 'tolk_pub_test_key' });
    });

    it('throws on blank referral code', async () => {
      await expect(
        Tolinku.referrals.complete({ code: '', referredUserId: 'user123' })
      ).rejects.toThrow(/referral code is required and must not be blank/);

      await expect(
        Tolinku.referrals.complete({ code: '   ', referredUserId: 'user123' })
      ).rejects.toThrow(/referral code is required and must not be blank/);
    });

    it('throws on blank token in deferred claim', async () => {
      await expect(
        Tolinku.deferred.claimByToken('')
      ).rejects.toThrow(/token is required and must not be blank/);

      await expect(
        Tolinku.deferred.claimByToken('   ')
      ).rejects.toThrow(/token is required and must not be blank/);
    });

    it('throws on blank userId in referral creation', async () => {
      await expect(
        Tolinku.referrals.create({ userId: '' })
      ).rejects.toThrow(/userId is required and must not be blank/);

      await expect(
        Tolinku.referrals.create({ userId: '   ' })
      ).rejects.toThrow(/userId is required and must not be blank/);
    });

    it('throws on blank eventType in track', async () => {
      await expect(
        Tolinku.track('')
      ).rejects.toThrow(/eventType must be a non-empty string/);

      await expect(
        Tolinku.track('   ')
      ).rejects.toThrow(/eventType must be a non-empty string/);
    });
  });

  describe('Initialization', () => {
    it('throws when calling methods before init', async () => {
      expect(() => Tolinku.getClient()).toThrow(/SDK not initialized/);
      await expect(Tolinku.track('test')).rejects.toThrow(/SDK not initialized/);
      await expect(Tolinku.flush()).rejects.toThrow(/SDK not initialized/);
      expect(() => Tolinku.referrals).toThrow(/SDK not initialized/);
      expect(() => Tolinku.deferred).toThrow(/SDK not initialized/);
    });

    it('requires apiKey', () => {
      expect(() => Tolinku.init({ apiKey: '' })).toThrow(/apiKey is required/);
    });

    it('warns on double initialization', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      Tolinku.init({ apiKey: 'tolk_pub_test_key' });
      Tolinku.init({ apiKey: 'tolk_pub_another_key' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('init() called while already initialized')
      );

      consoleWarnSpy.mockRestore();
    });

    it('uses default baseUrl if not provided', () => {
      Tolinku.init({ apiKey: 'tolk_pub_test_key' });
      expect(Tolinku.isConfigured()).toBe(true);
      // If it didn't throw, the default HTTPS URL was accepted
    });

    it('accepts custom baseUrl', () => {
      expect(() =>
        Tolinku.init({ apiKey: 'tolk_pub_test_key', baseUrl: 'https://custom.example.com' })
      ).not.toThrow();
    });

    it('enforces HTTPS on custom baseUrl', () => {
      expect(() =>
        Tolinku.init({ apiKey: 'tolk_pub_test_key', baseUrl: 'http://insecure.example.com' })
      ).toThrow(/must use HTTPS/);
    });
  });
});
