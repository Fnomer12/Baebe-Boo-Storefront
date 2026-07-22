import "server-only";

import {
  evaluatePromotionEligibility,
  type PromotionCampaign,
} from "@/domain/commerce/promotion-eligibility";
import { quoteOrder, type PricedLine, type Promotion } from "@/domain/commerce/pricing";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PromotionRow = {
  id: string;
  name: string;
  promotion_type: "percentage" | "fixed_amount" | "fixed_price" | "free_shipping" | "bundle";
  value: number | string;
  status: "draft" | "active" | "paused" | "expired";
  starts_at: string | null;
  ends_at: string | null;
  minimum_order_amount: number | string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  stackable: boolean;
  automatic: boolean;
};

type CodeRow = {
  id: string;
  promotion_id: string;
  code: string;
  usage_count: number;
  is_active: boolean;
};

export type AppliedPromotion = {
  promotionId: string;
  codeId: string | null;
  code: string | null;
  name: string;
  kind: Promotion["kind"];
  value: number;
  stackable: boolean;
};

export type CheckoutPromotionQuote = ReturnType<typeof quoteOrder> & {
  appliedPromotions: AppliedPromotion[];
  promotionMessage: string | null;
  promotionCodeValid: boolean;
};

function toCampaign(row: PromotionRow, usageCount: number): PromotionCampaign | null {
  const kind = row.promotion_type === "percentage"
    ? "percentage"
    : row.promotion_type === "fixed_amount"
      ? "fixed"
      : null;
  if (!kind) return null;

  return {
    id: row.id,
    kind,
    value: Number(row.value),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    minimumOrderAmount: row.minimum_order_amount === null ? null : Number(row.minimum_order_amount),
    usageLimit: row.usage_limit,
    usageCount,
    perCustomerLimit: row.per_customer_limit,
    stackable: row.stackable,
  };
}

export async function quoteCheckoutPromotions(input: {
  lines: PricedLine[];
  productIds: string[];
  deliveryFee: number;
  promotionCode?: string | null;
  customerUserId?: string | null;
}): Promise<CheckoutPromotionQuote> {
  const subtotal = input.lines.reduce(
    (sum, line) => sum + Math.max(0, line.unitPrice) * Math.max(0, line.quantity),
    0,
  );
  const requestedCode = input.promotionCode?.trim().toUpperCase() || null;
  const normalizedCode = requestedCode && requestedCode.length <= 64 ? requestedCode : null;
  const { data: automaticData, error: automaticError } = await supabaseAdmin
    .from("promotions")
    .select("id,name,promotion_type,value,status,starts_at,ends_at,minimum_order_amount,usage_limit,per_customer_limit,stackable,automatic")
    .eq("status", "active")
    .eq("automatic", true);
  if (automaticError) throw new Error("Could not validate active promotions.");

  let codeRow: CodeRow | null = null;
  let couponRow: PromotionRow | null = null;
  let invalidCodeReason: string | null = requestedCode && !normalizedCode
    ? "That promotion code is not valid."
    : null;
  if (normalizedCode) {
    const { data, error } = await supabaseAdmin
      .from("promotion_codes")
      .select("id,promotion_id,code,usage_count,is_active")
      .ilike("code", normalizedCode)
      .maybeSingle();
    if (error) throw new Error("Could not validate this promotion code.");
    codeRow = data as CodeRow | null;
    if (!codeRow || !codeRow.is_active) {
      invalidCodeReason = "That promotion code is not valid.";
      codeRow = null;
    } else {
      const { data: promotionData, error: promotionError } = await supabaseAdmin
        .from("promotions")
        .select("id,name,promotion_type,value,status,starts_at,ends_at,minimum_order_amount,usage_limit,per_customer_limit,stackable,automatic")
        .eq("id", codeRow.promotion_id)
        .maybeSingle();
      if (promotionError) throw new Error("Could not validate this promotion code.");
      couponRow = promotionData as PromotionRow | null;
      if (!couponRow) invalidCodeReason = "That promotion code is not valid.";
    }
  }

  const rows = [...((automaticData || []) as PromotionRow[]), ...(couponRow ? [couponRow] : [])];
  const promotionIds = [...new Set(rows.map((row) => row.id))];
  const [redemptionResult, productRuleResult] = promotionIds.length
    ? await Promise.all([
        supabaseAdmin.from("promotion_redemptions").select("promotion_id,user_id").in("promotion_id", promotionIds),
        supabaseAdmin.from("promotion_products").select("promotion_id,product_id,is_excluded").in("promotion_id", promotionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (redemptionResult.error || productRuleResult.error) {
    throw new Error("Could not validate active promotions.");
  }
  const redemptionData = redemptionResult.data;
  const productRuleData = productRuleResult.data;

  const usageByPromotion = new Map<string, number>();
  const customerUsageByPromotion = new Map<string, number>();
  for (const redemption of redemptionData || []) {
    const promotionId = String(redemption.promotion_id);
    usageByPromotion.set(promotionId, (usageByPromotion.get(promotionId) || 0) + 1);
    if (input.customerUserId && redemption.user_id === input.customerUserId) {
      customerUsageByPromotion.set(
        promotionId,
        (customerUsageByPromotion.get(promotionId) || 0) + 1,
      );
    }
  }
  const productRules = (productRuleData || []) as Array<{
    promotion_id: string;
    product_id: string;
    is_excluded: boolean;
  }>;

  const eligible = (row: PromotionRow, codeUsageCount = 0) => {
    const campaign = toCampaign(row, Math.max(usageByPromotion.get(row.id) || 0, codeUsageCount));
    if (!campaign) {
      return { promotion: null, reason: "This promotion type is not available online." };
    }
    const rules = productRules.filter((rule) => rule.promotion_id === row.id);
    const excludedIds = new Set(rules.filter((rule) => rule.is_excluded).map((rule) => rule.product_id));
    const includedIds = new Set(rules.filter((rule) => !rule.is_excluded).map((rule) => rule.product_id));
    if (input.productIds.some((id) => excludedIds.has(id))) {
      return { promotion: null, reason: "This promotion does not apply to every item in your cart." };
    }
    if (includedIds.size > 0 && input.productIds.some((id) => !includedIds.has(id))) {
      return { promotion: null, reason: "This promotion does not apply to every item in your cart." };
    }
    const result = evaluatePromotionEligibility(campaign, {
      subtotal,
      now: new Date(),
      customerUsageCount: customerUsageByPromotion.get(row.id) || 0,
    });
    return result.eligible
      ? { promotion: result.promotion, reason: null }
      : { promotion: null, reason: result.reason };
  };

  const automaticEntries = ((automaticData || []) as PromotionRow[])
    .map((row) => ({ row, result: eligible(row) }))
    .filter((entry): entry is { row: PromotionRow; result: { promotion: Promotion; reason: null } } => Boolean(entry.result.promotion));
  const couponResult = couponRow ? eligible(couponRow, codeRow?.usage_count || 0) : null;
  const quote = quoteOrder({
    lines: input.lines,
    automaticPromotions: automaticEntries.map((entry) => entry.result.promotion),
    coupon: couponResult?.promotion || undefined,
    deliveryFee: input.deliveryFee,
    rewardCredit: 0,
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const appliedPromotions = quote.appliedPromotionIds.map((promotionId) => {
    const row = rowById.get(promotionId)!;
    const promotion = toCampaign(row, 0)!;
    const isCoupon = couponRow?.id === promotionId;
    return {
      promotionId,
      codeId: isCoupon ? codeRow?.id || null : null,
      code: isCoupon ? normalizedCode : null,
      name: row.name,
      kind: promotion.kind,
      value: promotion.value,
      stackable: promotion.stackable,
    };
  });
  const couponApplied = appliedPromotions.some((promotion) => promotion.code);
  const promotionCodeValid = !requestedCode || Boolean(couponResult?.promotion);

  return {
    ...quote,
    appliedPromotions,
    promotionMessage: requestedCode
      ? invalidCodeReason
        ? invalidCodeReason
        : couponApplied
        ? `${couponRow?.name || "Promotion"} applied.`
        : couponResult?.promotion
          ? "A better active offer has been applied to your cart."
          : couponResult?.reason || "That promotion code is not valid."
      : null,
    promotionCodeValid,
  };
}
