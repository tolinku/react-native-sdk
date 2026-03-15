import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HttpClient } from './client';
import type {
  EcommerceItem, PurchaseParams, AddToCartParams, RemoveFromCartParams,
  AddToWishlistParams, BeginCheckoutParams, RefundParams, ViewItemParams,
  SearchParams, ShareParams, RateParams, SpendCreditsParams, AddPaymentInfoParams,
} from './types';
import { debugLog, debugWarn } from './debug';

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 500;
const CART_ID_STORAGE_KEY = 'tolinku_ecom_cart_id';

interface QueuedEcomEvent {
  event_type: string;
  transaction_id?: string;
  revenue?: number;
  currency?: string;
  cart_id?: string;
  coupon_code?: string;
  discount?: number;
  shipping?: number;
  tax?: number;
  items?: EcommerceItem[];
  properties?: Record<string, string>;
  user_id?: string;
  campaign?: string;
  source?: string;
  medium?: string;
  platform?: string;
}

export class Ecommerce {
  private client: HttpClient;
  private queue: QueuedEcomEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private isFlushing = false;
  private getUserId: () => string | null;
  private memoryCartId: string | null = null;

  constructor(client: HttpClient, getUserId: () => string | null) {
    this.client = client;
    this.getUserId = getUserId;

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  // ─── Public methods (13 event types) ────────────────────

  async viewItem(params: ViewItemParams): Promise<void> {
    await this.enqueue({ event_type: 'view_item', items: params.items });
  }

  async addToCart(params: AddToCartParams): Promise<void> {
    const cartId = params.cart_id || await this.getOrCreateCartId();
    await this.enqueue({ event_type: 'add_to_cart', items: params.items, cart_id: cartId });
  }

  async removeFromCart(params: RemoveFromCartParams): Promise<void> {
    const cartId = params.cart_id || await this.getCartId();
    await this.enqueue({ event_type: 'remove_from_cart', items: params.items, cart_id: cartId });
  }

  async addToWishlist(params: AddToWishlistParams): Promise<void> {
    await this.enqueue({ event_type: 'add_to_wishlist', items: params.items });
  }

  async viewCart(): Promise<void> {
    const cartId = await this.getCartId();
    await this.enqueue({ event_type: 'view_cart', cart_id: cartId });
  }

  async addPaymentInfo(params?: AddPaymentInfoParams): Promise<void> {
    const cartId = params?.cart_id || await this.getCartId();
    await this.enqueue({ event_type: 'add_payment_info', cart_id: cartId });
  }

  async beginCheckout(params: BeginCheckoutParams): Promise<void> {
    const cartId = params.cart_id || await this.getCartId();
    await this.enqueue({
      event_type: 'begin_checkout',
      revenue: params.revenue,
      currency: params.currency,
      cart_id: cartId,
      items: params.items,
    });
  }

  async purchase(params: PurchaseParams): Promise<void> {
    const cartId = params.cart_id || await this.getCartId();
    await this.enqueue({
      event_type: 'purchase',
      transaction_id: params.transaction_id,
      revenue: params.revenue,
      currency: params.currency,
      cart_id: cartId,
      coupon_code: params.coupon_code,
      discount: params.discount,
      shipping: params.shipping,
      tax: params.tax,
      items: params.items,
    });
    await this.clearCartId();
  }

  async refund(params: RefundParams): Promise<void> {
    await this.enqueue({
      event_type: 'refund',
      transaction_id: params.transaction_id,
      revenue: params.revenue,
      currency: params.currency,
      items: params.items,
    });
  }

  async search(params: SearchParams): Promise<void> {
    await this.enqueue({ event_type: 'search', properties: { search_term: params.search_term } });
  }

  async share(params: ShareParams): Promise<void> {
    const props: Record<string, string> = {};
    if (params.item_id) props.item_id = params.item_id;
    if (params.url) props.url = params.url;
    if (params.method) props.method = params.method;
    await this.enqueue({ event_type: 'share', properties: props });
  }

  async rate(params: RateParams): Promise<void> {
    await this.enqueue({
      event_type: 'rate',
      properties: {
        item_id: params.item_id,
        rating: String(params.rating),
        ...(params.max_rating != null ? { max_rating: String(params.max_rating) } : {}),
      },
    });
  }

  async spendCredits(params: SpendCreditsParams): Promise<void> {
    await this.enqueue({ event_type: 'spend_credits', revenue: params.revenue, currency: params.currency });
  }

  // ─── Flush ─────────────────────────────────────────────

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const events = this.queue.splice(0);
    this.cancelFlushTimer();

    try {
      debugLog(`Flushing ${events.length} ecommerce event(s)`);
      const result = await this.client.post<{ ok: boolean; accepted?: number; errors?: string[] }>(
        '/v1/api/analytics/ecommerce/batch',
        { events },
      );
      if (result.errors && result.errors.length > 0) {
        debugWarn(`Ecommerce batch partial failure: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      debugWarn(`Failed to flush ecommerce events: ${(err as Error).message}`);
      const spaceLeft = MAX_QUEUE_SIZE - this.queue.length;
      if (spaceLeft > 0) {
        this.queue.unshift(...events.slice(0, spaceLeft));
      }
    } finally {
      this.isFlushing = false;
    }
  }

  async destroy(): Promise<void> {
    this.cancelFlushTimer();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;

    try {
      await this.flush();
    } catch {
      // Best-effort flush during shutdown
    }
  }

  // ─── Private ───────────────────────────────────────────

  private async enqueue(event: QueuedEcomEvent): Promise<void> {
    const userId = this.getUserId();
    if (userId) event.user_id = userId;

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      debugWarn(`Ecommerce queue full (${MAX_QUEUE_SIZE}). Dropping oldest event.`);
      this.queue.shift();
    }

    this.queue.push(event);

    if (this.queue.length >= BATCH_SIZE) {
      await this.flush();
    } else if (this.queue.length === 1) {
      this.startFlushTimer();
    }
  }

  private handleAppStateChange = (state: AppStateStatus): void => {
    if (state === 'background' || state === 'inactive') {
      this.flush().catch(() => {});
    }
  };

  private startFlushTimer(): void {
    this.cancelFlushTimer();
    this.flushTimer = setTimeout(() => {
      this.flush().catch((err) => {
        debugWarn(`Ecommerce timer flush failed: ${(err as Error).message}`);
      });
    }, FLUSH_INTERVAL_MS);
  }

  private cancelFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ─── Cart ID lifecycle (AsyncStorage + memory fallback) ─

  private async getOrCreateCartId(): Promise<string> {
    const existing = await this.getCartId();
    if (existing) return existing;

    const cartId = this.generateId();
    await this.setCartId(cartId);
    return cartId;
  }

  private async getCartId(): Promise<string | undefined> {
    try {
      const stored = await AsyncStorage.getItem(CART_ID_STORAGE_KEY);
      if (stored) return stored;
    } catch { /* ignore */ }
    return this.memoryCartId || undefined;
  }

  private async setCartId(cartId: string): Promise<void> {
    this.memoryCartId = cartId;
    try {
      await AsyncStorage.setItem(CART_ID_STORAGE_KEY, cartId);
    } catch { /* memory fallback is already set */ }
  }

  private async clearCartId(): Promise<void> {
    this.memoryCartId = null;
    try {
      await AsyncStorage.removeItem(CART_ID_STORAGE_KEY);
    } catch { /* ignore */ }
  }

  private generateId(): string {
    // React Native has crypto.randomUUID in Hermes (React Native 0.74+)
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
