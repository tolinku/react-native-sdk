/** SDK version */
export const SDK_VERSION = '0.1.0';

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

/** Options for claiming deferred link by signals */
export interface ClaimBySignalsOptions {
  appspaceId: string;
  timezone?: string;
  language?: string;
  screenWidth?: number;
  screenHeight?: number;
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
