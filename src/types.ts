/** SDK version */
export const SDK_VERSION = '0.7.0';

/** Configuration options for the Tolinku SDK */
export interface TolinkuConfig {
  /** Your Tolinku publishable API key (starts with tolk_pub_) */
  apiKey: string;
  /** Base URL of your Tolinku domain. Defaults to https://api.tolinku.com */
  baseUrl?: string;
  /** Enable debug logging to the console. Defaults to false. */
  debug?: boolean;
  /** Request timeout in milliseconds. Defaults to 30000 (30 seconds). */
  timeout?: number;
}

/** Resolved configuration with all defaults applied */
export interface ResolvedTolinkuConfig {
  apiKey: string;
  baseUrl: string;
  debug: boolean;
  timeout: number;
}

/** Properties for custom event tracking */
export interface TrackProperties {
  campaign?: string;
  source?: string;
  medium?: string;
  platform?: string;
  [key: string]: string | undefined;
}

/** Options for creating a referral */
export interface CreateReferralOptions {
  userId: string;
  metadata?: Record<string, string>;
  userName?: string;
}

/** Response from creating a referral */
export interface CreateReferralResult {
  referral_code: string;
  referral_url: string | null;
  referral_id: string;
}

/** Options for completing a referral */
export interface CompleteReferralOptions {
  code: string;
  referredUserId: string;
  milestone?: string;
  referredUserName?: string;
}

/** Response from completing a referral */
export interface CompleteReferralResult {
  referral: {
    id: string;
    referrer_id: string;
    referred_user_id: string;
    status: string;
    milestone: string;
    completed_at: string;
    reward_type: string | null;
    reward_value: string | null;
  };
}

/** Options for updating a referral milestone */
export interface MilestoneOptions {
  code: string;
  milestone: string;
}

/** Response from updating a milestone */
export interface MilestoneResult {
  referral: {
    id: string;
    referral_code: string;
    milestone: string;
    status: string;
    reward_type: string | null;
    reward_value: string | null;
  };
}

/** Referral info returned by GET /api/referral/:code */
export interface ReferralInfo {
  referrer_id: string;
  status: string;
  milestone: string;
  milestone_history: Array<{ milestone: string; timestamp: string }>;
  reward_type: string | null;
  reward_value: string | null;
  reward_claimed: boolean;
  created_at: string;
}

/** Leaderboard entry */
export interface LeaderboardEntry {
  referrer_id: string;
  referrer_name: string | null;
  total: number;
  completed: number;
  pending: number;
  total_reward_value: string | null;
}

/** Deferred deep link result */
export interface DeferredLink {
  deep_link_path: string;
  appspace_id: string;
  referrer_id?: string;
  referral_code?: string;
}

/**
 * What a Tolinku link turned out to mean.
 *
 * The same shape in every SDK, so an app moving between them reads one thing.
 * The Appspace the link belongs to is deliberately not here: the app already
 * knows which Appspace it is, and nothing about routing a link needs it.
 */
export interface ResolvedLink {
  /** The route that answers this link. */
  route: {
    prefix: string;
    name: string;
    template: string;
    link_type?: string;
  };
  /** The token the link carried, or '' where it carried none. */
  token: string;
  /** The canonical path, with the token wherever the route's prefix puts it. */
  deep_link_path: string;
}

/** Options for claiming deferred link by signals */
export interface ClaimBySignalsOptions {
  appspaceId: string;
  timezone?: string;
  language?: string;
  screenWidth?: number;
  screenHeight?: number;
  /** Defaults to `PixelRatio.get()`. Override only if you report a custom screen size. */
  devicePixelRatio?: number;
  /** Defaults to `Platform.Version`. Compared on the major component only. */
  osVersion?: string;
}

/** In-app message from the API */
export interface Message {
  id: string;
  name: string;
  title: string;
  body: string | null;
  trigger: string;
  trigger_value: string | null;
  content: MessageContent | null;
  background_color: string;
  priority: number;
  dismiss_days: number | null;
  max_impressions: number | null;
  min_interval_hours: number | null;
}

/** Puck component content tree */
export interface MessageContent {
  root: { props: Record<string, unknown> };
  content: MessageComponent[];
  /**
   * A Section's children, keyed "<component id>:content".
   *
   * Puck keeps nested content here rather than on the parent's props, so a
   * renderer that reads props.children finds nothing and draws every Section
   * as an empty box. This was missing from the type entirely, which is part of
   * how that went unnoticed.
   */
  zones?: Record<string, MessageComponent[]>;
}

/**
 * The app a message belongs to, sent alongside it.
 *
 * AppIcon, StoreButtons and DeepLinkButton describe the app rather than the
 * message, so the content has nothing to draw them from.
 */
export interface MessageAppContext {
  name: string;
  icon_url: string | null;
  ios_store_url: string | null;
  android_store_url: string | null;
  deep_link_url: string | null;
  ios_badge_url: string;
  android_badge_url: string;
}

/** A single Puck component */
export interface MessageComponent {
  type: string;
  props: Record<string, unknown>;
}

/** Options for showing an in-app message */
export interface ShowMessageOptions {
  trigger?: string;
  triggerValue?: string;
  onDismiss?: (messageId: string) => void;
  onButtonPress?: (action: string, messageId: string) => void;
}

// ─── Ecommerce Types ─────────────────────────────────────

export interface EcommerceItem {
  item_id: string;
  item_name?: string;
  item_category?: string;
  item_brand?: string;
  item_variant?: string;
  item_list_name?: string;
  item_list_id?: string;
  item_image_url?: string;
  price?: number;
  quantity?: number;
  currency?: string;
  coupon_code?: string;
  discount?: number;
}

export interface PurchaseParams {
  transaction_id: string;
  revenue: number;
  currency: string;
  items?: EcommerceItem[];
  cart_id?: string;
  coupon_code?: string;
  discount?: number;
  shipping?: number;
  tax?: number;
}

export interface AddToCartParams {
  items: EcommerceItem[];
  cart_id?: string;
}

export interface RemoveFromCartParams {
  items: EcommerceItem[];
  cart_id?: string;
}

export interface AddToWishlistParams {
  items: EcommerceItem[];
}

export interface BeginCheckoutParams {
  revenue?: number;
  currency?: string;
  cart_id?: string;
  items?: EcommerceItem[];
}

export interface RefundParams {
  transaction_id: string;
  revenue: number;
  currency?: string;
  items?: EcommerceItem[];
}

export interface ViewItemParams {
  items: EcommerceItem[];
}

export interface SearchParams {
  search_term: string;
}

export interface AddPaymentInfoParams {
  cart_id?: string;
}

export interface ShareParams {
  item_id?: string;
  url?: string;
  method?: string;
}

export interface RateParams {
  item_id: string;
  rating: number;
  max_rating?: number;
}

export interface SpendCreditsParams {
  revenue: number;
  currency: string;
}
