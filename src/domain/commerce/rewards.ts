export const DEFAULT_LOYALTY_POLICY = {
  pointsPerCedi: 100,
  minimumRedemptionPoints: 500,
  maximumOrderShare: 0.2,
} as const;

const POINTS_PER_CEDI = DEFAULT_LOYALTY_POLICY.pointsPerCedi;
const MINIMUM_REDEMPTION_POINTS = DEFAULT_LOYALTY_POLICY.minimumRedemptionPoints;
const MAXIMUM_ORDER_SHARE = DEFAULT_LOYALTY_POLICY.maximumOrderShare;

export type LoyaltyRedemptionPolicy = {
  pointsPerCedi: number;
  minimumRedemptionPoints: number;
  maximumOrderShare: number;
  allowOnline?: boolean;
  allowAtCounter?: boolean;
};

export type LoyaltyTier = {
  id: string;
  name: string;
  minLifetimePoints: number;
  earnMultiplier: number;
  isActive: boolean;
};

export type PurchaseEarnConfig = {
  pointsPerCedi: number;
  minimumOrderAmount: number;
  categoryMultipliers: Record<string, number>;
  expiryDays: number | null;
};

export const DEFAULT_PURCHASE_EARN_CONFIG: PurchaseEarnConfig = {
  pointsPerCedi: 1,
  minimumOrderAmount: 0,
  categoryMultipliers: {},
  expiryDays: 365,
};

export function parsePurchaseEarnConfig(raw: unknown): PurchaseEarnConfig {
  const config = (raw || {}) as Record<string, unknown>;
  const multipliers: Record<string, number> = {};
  const rawMultipliers = config.categoryMultipliers;
  if (rawMultipliers && typeof rawMultipliers === "object") {
    for (const [key, value] of Object.entries(rawMultipliers as Record<string, unknown>)) {
      const multiplier = Number(value);
      if (key.trim() && Number.isFinite(multiplier) && multiplier > 0 && multiplier <= 100) {
        multipliers[key.trim()] = multiplier;
      }
    }
  }
  const pointsPerCedi = Number(config.points_per_cedi ?? config.pointsPerCedi);
  const minimumOrderAmount = Number(config.minimum_order_amount ?? config.minimumOrderAmount);
  const expiryDays = config.expiry_days ?? config.expiryDays;
  return {
    pointsPerCedi:
      Number.isFinite(pointsPerCedi) && pointsPerCedi > 0 && pointsPerCedi <= 100_000
        ? pointsPerCedi
        : DEFAULT_PURCHASE_EARN_CONFIG.pointsPerCedi,
    minimumOrderAmount:
      Number.isFinite(minimumOrderAmount) && minimumOrderAmount >= 0
        ? minimumOrderAmount
        : 0,
    categoryMultipliers: multipliers,
    expiryDays:
      expiryDays === null || expiryDays === undefined
        ? DEFAULT_PURCHASE_EARN_CONFIG.expiryDays
        : Number.isFinite(Number(expiryDays)) && Number(expiryDays) > 0
          ? Math.floor(Number(expiryDays))
          : null,
  };
}

/**
 * Points for a paid merchandise total.
 *
 * `multiplier` is the customer's tier multiplier (1 when no tiers apply).
 * `categoryMultiplier` lets an admin boost events like "double points on
 * Feeding week" — the highest matching line-category multiplier wins and the
 * caller is responsible for picking it.
 */
export function calculateEarnedPoints(
  paidMerchandiseTotal: number,
  options: { pointsPerCedi?: number; multiplier?: number } = {},
) {
  const rate =
    options.pointsPerCedi !== undefined &&
    Number.isFinite(options.pointsPerCedi) &&
    options.pointsPerCedi > 0
      ? options.pointsPerCedi
      : 1;
  const multiplier =
    options.multiplier !== undefined && Number.isFinite(options.multiplier) && options.multiplier > 0
      ? options.multiplier
      : 1;
  return Math.max(0, Math.floor(paidMerchandiseTotal * rate * multiplier));
}

export function tierForLifetimePoints(
  tiers: readonly LoyaltyTier[],
  lifetimePoints: number,
): LoyaltyTier | null {
  const active = tiers
    .filter((tier) => tier.isActive)
    .sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  let current: LoyaltyTier | null = null;
  for (const tier of active) {
    if (lifetimePoints >= tier.minLifetimePoints) current = tier;
  }
  return current;
}

export function calculateRedemption({
  points,
  orderSubtotal,
  policy,
}: {
  points: number;
  orderSubtotal: number;
  policy?: Partial<LoyaltyRedemptionPolicy>;
}) {
  const pointsPerCedi =
    policy?.pointsPerCedi !== undefined && Number.isFinite(policy.pointsPerCedi) && policy.pointsPerCedi > 0
      ? policy.pointsPerCedi
      : POINTS_PER_CEDI;
  const minimum =
    policy?.minimumRedemptionPoints !== undefined &&
    Number.isFinite(policy.minimumRedemptionPoints) &&
    policy.minimumRedemptionPoints > 0
      ? Math.floor(policy.minimumRedemptionPoints)
      : MINIMUM_REDEMPTION_POINTS;
  const maxShare =
    policy?.maximumOrderShare !== undefined &&
    Number.isFinite(policy.maximumOrderShare) &&
    policy.maximumOrderShare > 0 &&
    policy.maximumOrderShare <= 1
      ? policy.maximumOrderShare
      : MAXIMUM_ORDER_SHARE;
  const availablePoints = Math.max(0, Math.floor(points));
  if (availablePoints < minimum || orderSubtotal <= 0) {
    return { pointsUsed: 0, credit: 0 };
  }

  const maximumCredit = Math.floor(orderSubtotal * maxShare * 100) / 100;
  const requestedCredit = Math.floor(availablePoints / pointsPerCedi);
  const credit = Math.min(maximumCredit, requestedCredit);
  const pointsUsed = Math.floor(credit * pointsPerCedi);

  return { pointsUsed, credit: pointsUsed / pointsPerCedi };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type LoyaltyEventType = "purchase" | "referral" | "review" | "birthday" | "social_share";

export async function creditLoyaltyPoints(
  supabase: Pick<SupabaseClient, "rpc">,
  input: {
    userId: string;
    eventType: LoyaltyEventType;
    sourceKey: string;
    reason: string;
    orderId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.rpc("credit_loyalty_points", {
    p_user_id: input.userId,
    p_event_type: input.eventType,
    p_source_key: input.sourceKey,
    p_reason: input.reason,
    p_order_id: input.orderId || null,
    p_metadata: input.metadata || {},
  });
  return { error };
}
