import { Tolinku } from '../src/Tolinku';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock React Native modules
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
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ ok: true }),
  text: () => Promise.resolve(''),
  headers: { get: () => null },
});
global.fetch = mockFetch;

/** Helper to extract events from all fetch calls */
function getAllEvents(): any[] {
  const events: any[] = [];
  for (const call of mockFetch.mock.calls) {
    try {
      const body = JSON.parse(call[1].body);
      if (body.events) events.push(...body.events);
    } catch { /* skip non-JSON calls */ }
  }
  return events;
}

describe('Ecommerce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    if (Tolinku.isConfigured()) {
      Tolinku.destroy();
    }
    Tolinku.init({ apiKey: 'tolk_pub_test_key', baseUrl: 'https://api.test.com' });
  });

  afterEach(async () => {
    if (Tolinku.isConfigured()) {
      await Tolinku.destroy();
    }
  });

  // ─── Initialization ──────────────────────────────────

  it('should be accessible after init', () => {
    expect(Tolinku.ecommerce).toBeDefined();
  });

  it('should throw when accessed before init', async () => {
    await Tolinku.destroy();
    expect(() => Tolinku.ecommerce).toThrow('not initialized');
  });

  // ─── Queuing ─────────────────────────────────────────

  it('should queue events without immediate flush', async () => {
    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'sku_1' }] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should flush when batch size reached (10 events)', async () => {
    for (let i = 0; i < 10; i++) {
      await Tolinku.ecommerce.viewItem({ items: [{ item_id: `sku_${i}` }] });
    }
    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events).toHaveLength(10);
  });

  it('should flush to correct endpoint', async () => {
    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.flush();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v1/api/analytics/ecommerce/batch');
  });

  it('should be no-op when flushing empty queue', async () => {
    await Tolinku.ecommerce.flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ─── Purchase ────────────────────────────────────────

  it('should send purchase with all fields', async () => {
    await Tolinku.ecommerce.purchase({
      transaction_id: 'order_123',
      revenue: 49.99,
      currency: 'USD',
      coupon_code: 'SAVE10',
      discount: 5.0,
      shipping: 4.99,
      tax: 3.75,
      items: [{ item_id: 'sku_1', item_name: 'T-Shirt', price: 24.99, quantity: 2 }],
    });
    await Tolinku.ecommerce.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const event = body.events[0];
    expect(event.event_type).toBe('purchase');
    expect(event.transaction_id).toBe('order_123');
    expect(event.revenue).toBe(49.99);
    expect(event.currency).toBe('USD');
    expect(event.coupon_code).toBe('SAVE10');
    expect(event.discount).toBe(5.0);
    expect(event.shipping).toBe(4.99);
    expect(event.tax).toBe(3.75);
    expect(event.items).toHaveLength(1);
    expect(event.items[0].item_id).toBe('sku_1');
    expect(event.items[0].item_name).toBe('T-Shirt');
    expect(event.items[0].price).toBe(24.99);
    expect(event.items[0].quantity).toBe(2);
  });

  // ─── User ID ─────────────────────────────────────────

  it('should inject user_id when set', async () => {
    Tolinku.setUserId('user_789');
    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].user_id).toBe('user_789');
  });

  it('should not inject user_id when null', async () => {
    Tolinku.setUserId(null);
    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].user_id).toBeUndefined();
  });

  // ─── Cart ID lifecycle ───────────────────────────────

  it('should auto-generate cart_id on addToCart', async () => {
    await Tolinku.ecommerce.addToCart({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.flush();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'tolinku_ecom_cart_id',
      expect.any(String)
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].cart_id).toBeDefined();
    expect(typeof body.events[0].cart_id).toBe('string');
    expect(body.events[0].cart_id.length).toBeGreaterThan(0);
  });

  it('should reuse cart_id across cart events', async () => {
    // Mock AsyncStorage to return the cart_id that was set
    let storedCartId: string | null = null;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
      if (key === 'tolinku_ecom_cart_id') storedCartId = value;
      return Promise.resolve();
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'tolinku_ecom_cart_id') return Promise.resolve(storedCartId);
      return Promise.resolve(null);
    });

    await Tolinku.ecommerce.addToCart({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.viewCart();
    await Tolinku.ecommerce.beginCheckout({});
    await Tolinku.ecommerce.flush();

    const events = getAllEvents();
    const cartIds = events.map((e: any) => e.cart_id).filter(Boolean);
    expect(cartIds.length).toBeGreaterThanOrEqual(1);
    // All cart_ids should be the same
    expect(new Set(cartIds).size).toBe(1);
  });

  it('should clear cart_id after purchase and generate new one for next cart', async () => {
    let storedCartId: string | null = null;
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
      if (key === 'tolinku_ecom_cart_id') storedCartId = value;
      return Promise.resolve();
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'tolinku_ecom_cart_id') return Promise.resolve(storedCartId);
      return Promise.resolve(null);
    });
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'tolinku_ecom_cart_id') storedCartId = null;
      return Promise.resolve();
    });

    await Tolinku.ecommerce.addToCart({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.purchase({ transaction_id: 'order_1', revenue: 10, currency: 'USD' });

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('tolinku_ecom_cart_id');

    // New cart should get a new ID
    await Tolinku.ecommerce.addToCart({ items: [{ item_id: 'sku_2' }] });
    await Tolinku.ecommerce.flush();

    const events = getAllEvents();
    const firstCartId = events[0]?.cart_id;
    const lastCartId = events[events.length - 1]?.cart_id;
    expect(firstCartId).toBeDefined();
    expect(lastCartId).toBeDefined();
    expect(firstCartId).not.toBe(lastCartId);
  });

  // ─── Error recovery ──────────────────────────────────

  it('should re-queue events on flush failure and succeed on retry', async () => {
    // First flush fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'sku_1' }] });
    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'sku_2' }] });

    // Flush should fail
    await Tolinku.ecommerce.flush();

    // Reset mock to succeed
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(''),
      headers: { get: () => null },
    });

    // Retry should work and contain both events
    await Tolinku.ecommerce.flush();

    const lastCallBody = JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body);
    expect(lastCallBody.events).toHaveLength(2);
    expect(lastCallBody.events[0].items[0].item_id).toBe('sku_1');
    expect(lastCallBody.events[1].items[0].item_id).toBe('sku_2');
  });

  // ─── Search and Rate properties ──────────────────────

  it('should track search with search_term in properties', async () => {
    await Tolinku.ecommerce.search({ search_term: 'red shoes' });
    await Tolinku.ecommerce.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].event_type).toBe('search');
    expect(body.events[0].properties.search_term).toBe('red shoes');
  });

  it('should track rate with rating as string in properties', async () => {
    await Tolinku.ecommerce.rate({ item_id: 'sku_1', rating: 4.5, max_rating: 5 });
    await Tolinku.ecommerce.flush();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].event_type).toBe('rate');
    expect(body.events[0].properties.item_id).toBe('sku_1');
    expect(body.events[0].properties.rating).toBe('4.5');
    expect(body.events[0].properties.max_rating).toBe('5');
  });

  // ─── All 13 event types ──────────────────────────────

  it('should track all 13 event types', async () => {
    await Tolinku.ecommerce.viewItem({ items: [{ item_id: 'a' }] });
    await Tolinku.ecommerce.addToCart({ items: [{ item_id: 'a' }] });
    await Tolinku.ecommerce.removeFromCart({ items: [{ item_id: 'a' }] });
    await Tolinku.ecommerce.addToWishlist({ items: [{ item_id: 'a' }] });
    await Tolinku.ecommerce.viewCart();
    await Tolinku.ecommerce.addPaymentInfo();
    await Tolinku.ecommerce.beginCheckout({});
    await Tolinku.ecommerce.purchase({ transaction_id: 't', revenue: 1, currency: 'USD' });
    await Tolinku.ecommerce.refund({ transaction_id: 't', revenue: 1 });
    await Tolinku.ecommerce.search({ search_term: 'x' });
    // flush at 10
    await Tolinku.ecommerce.share({ item_id: 'a' });
    await Tolinku.ecommerce.rate({ item_id: 'a', rating: 5 });
    await Tolinku.ecommerce.spendCredits({ revenue: 10, currency: 'USD' });
    await Tolinku.ecommerce.flush();

    const allTypes = getAllEvents().map((e: any) => e.event_type);

    expect(allTypes).toContain('view_item');
    expect(allTypes).toContain('add_to_cart');
    expect(allTypes).toContain('remove_from_cart');
    expect(allTypes).toContain('add_to_wishlist');
    expect(allTypes).toContain('view_cart');
    expect(allTypes).toContain('add_payment_info');
    expect(allTypes).toContain('begin_checkout');
    expect(allTypes).toContain('purchase');
    expect(allTypes).toContain('refund');
    expect(allTypes).toContain('search');
    expect(allTypes).toContain('share');
    expect(allTypes).toContain('rate');
    expect(allTypes).toContain('spend_credits');
  });
});
