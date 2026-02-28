import type { HttpClient } from './client';
import type {
  CreateReferralOptions,
  CreateReferralResult,
  CompleteReferralOptions,
  CompleteReferralResult,
  MilestoneOptions,
  MilestoneResult,
  ReferralInfo,
  LeaderboardEntry,
} from './types';

export class Referrals {
  constructor(private client: HttpClient) {}

  /** Create a new referral for a user */
  async create(options: CreateReferralOptions): Promise<CreateReferralResult> {
    if (!options.userId || !options.userId.trim()) {
      throw new Error('Tolinku: userId is required and must not be blank.');
    }

    return this.client.post('/v1/api/referral/create', {
      user_id: options.userId,
      metadata: options.metadata,
      user_name: options.userName,
    });
  }

  /** Get referral info by code */
  async get(code: string): Promise<ReferralInfo> {
    if (!code || !code.trim()) {
      throw new Error('Tolinku: referral code is required and must not be blank.');
    }

    return this.client.get(`/v1/api/referral/${encodeURIComponent(code)}`);
  }

  /** Complete a referral (mark as converted) */
  async complete(options: CompleteReferralOptions): Promise<CompleteReferralResult> {
    if (!options.code || !options.code.trim()) {
      throw new Error('Tolinku: referral code is required and must not be blank.');
    }
    if (!options.referredUserId || !options.referredUserId.trim()) {
      throw new Error('Tolinku: referredUserId is required and must not be blank.');
    }

    return this.client.post('/v1/api/referral/complete', {
      referral_code: options.code,
      referred_user_id: options.referredUserId,
      milestone: options.milestone,
      referred_user_name: options.referredUserName,
    });
  }

  /** Update a referral milestone */
  async milestone(options: MilestoneOptions): Promise<MilestoneResult> {
    if (!options.code || !options.code.trim()) {
      throw new Error('Tolinku: referral code is required and must not be blank.');
    }
    if (!options.milestone || !options.milestone.trim()) {
      throw new Error('Tolinku: milestone is required and must not be blank.');
    }

    return this.client.post('/v1/api/referral/milestone', {
      referral_code: options.code,
      milestone: options.milestone,
    });
  }

  /** Claim a referral reward */
  async claimReward(code: string): Promise<{ success: boolean; referral_code: string; reward_claimed: boolean }> {
    if (!code || !code.trim()) {
      throw new Error('Tolinku: referral code is required and must not be blank.');
    }

    return this.client.post('/v1/api/referral/claim-reward', {
      referral_code: code,
    });
  }

  /** Get the referral leaderboard */
  async leaderboard(limit: number = 25): Promise<{ leaderboard: LeaderboardEntry[] }> {
    return this.client.get('/v1/api/referral/leaderboard', {
      limit: String(limit),
    });
  }
}
