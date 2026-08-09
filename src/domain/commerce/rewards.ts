const POINTS_PER_CEDI = 100;
const MINIMUM_REDEMPTION_POINTS = 500;
const MAXIMUM_ORDER_SHARE = 0.2;

export function calculateEarnedPoints(paidMerchandiseTotal: number) {
  return Math.max(0, Math.floor(paidMerchandiseTotal));
}

export function calculateRedemption({
  points,
  orderSubtotal,
}: {
  points: number;
  orderSubtotal: number;
}) {
  const availablePoints = Math.max(0, Math.floor(points));
  if (availablePoints < MINIMUM_REDEMPTION_POINTS || orderSubtotal <= 0) {
    return { pointsUsed: 0, credit: 0 };
  }

  const maximumCredit = Math.floor(orderSubtotal * MAXIMUM_ORDER_SHARE * 100) / 100;
  const requestedCredit = Math.floor(availablePoints / POINTS_PER_CEDI);
  const credit = Math.min(maximumCredit, requestedCredit);
  const pointsUsed = Math.floor(credit * POINTS_PER_CEDI);

  return { pointsUsed, credit: pointsUsed / POINTS_PER_CEDI };
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
