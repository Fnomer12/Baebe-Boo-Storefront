import "server-only";

import {
  deliveryFeeAfterPromotions,
  evaluatePromotionEligibility,
  isDiscountPromotion,
  resolvePromotionStack,
  type EligiblePromotion,
  type PromotionCampaign,
  type PromotionKind,
} from "@/domain/commerce/promotion-eligibility";
import { matchPromotionTargeting } from "@/domain/commerce/promotion-targeting";
import { resolveVoucherRedemption } from "@/domain/commerce/voucher-redemption";
import { quoteOrder, type PricedLine } from "@/domain/commerce/pricing";
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
  /** Absent until the channel migration lands; treated as online-only. */
  available_online?: boolean | null;
  available_at_counter?: boolean | null;
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
  kind: PromotionKind;
  value: number;
  stackable: boolean;
  /** Matching-lines subtotal; absent means the whole basket. */
  eligibleSubtotal?: number;
};

export type CheckoutPromotionQuote = ReturnType<typeof quoteOrder> & {
  appliedPromotions: AppliedPromotion[];
  promotionMessage: string | null;
  promotionCodeValid: boolean;
  voucherCode: string | null;
  voucherCredit: number;
  voucherCodeValid: boolean;
  voucherMessage: string | null;
};

const promotionColumns =
  "id,name,promotion_type,value,status,starts_at,ends_at,minimum_order_amount,usage_limit,per_customer_limit,stackable,automatic,available_online,available_at_counter";

const legacyPromotionColumns =
  "id,name,promotion_type,value,status,starts_at,ends_at,minimum_order_amount,usage_limit,per_customer_limit,stackable,automatic";

async function fetchPromotionsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  // Single-id path (coupon lookup) uses eq+maybeSingle so test doubles and
  // PostgREST caches treat it as one row, not a list.
  if (ids.length === 1) {
    const attempt = await supabaseAdmin
      .from("promotions")
      .select(promotionColumns)
      .eq("id", ids[0])
      .maybeSingle();
    if (!attempt.error) return attempt.data ? [(attempt.data as PromotionRow)] : [];
    const legacy = await supabaseAdmin
      .from("promotions")
      .select(legacyPromotionColumns)
      .eq("id", ids[0])
      .maybeSingle();
    if (legacy.error) throw new Error("Could not validate this promotion code.");
    const row = legacy.data as PromotionRow | null;
    return row ? [{ ...row, available_online: true, available_at_counter: false }] : [];
  }
  const attempt = await supabaseAdmin.from("promotions").select(promotionColumns).in("id", ids);
  if (!attempt.error) return (attempt.data || []) as PromotionRow[];
  // Channel columns missing (migration unapplied): fall back to legacy shape.
  const legacy = await supabaseAdmin.from("promotions").select(legacyPromotionColumns).in("id", ids);
  if (legacy.error) throw new Error("Could not validate active promotions.");
  return ((legacy.data || []) as PromotionRow[]).map((row) => ({
    ...row,
    available_online: true,
    available_at_counter: false,
  }));
}

async function fetchAutomaticPromotions() {
  const attempt = await supabaseAdmin
    .from("promotions")
    .select(promotionColumns)
    .eq("status", "active")
    .eq("automatic", true);
  if (!attempt.error) return (attempt.data || []) as PromotionRow[];
  const legacy = await supabaseAdmin
    .from("promotions")
    .select(legacyPromotionColumns)
    .eq("status", "active")
    .eq("automatic", true);
  if (legacy.error) throw new Error("Could not validate active promotions.");
  return ((legacy.data || []) as PromotionRow[]).map((row) => ({
    ...row,
    available_online: true,
    available_at_counter: false,
  }));
}

function toCampaign(row: PromotionRow, usageCount: number): PromotionCampaign | null {
  // `fixed_price` and `bundle` still have no implementation, and the admin can
  // no longer create them. Old rows fall through to the "not available online"
  // reason rather than silently discounting something.
  const kind: PromotionKind | null =
    row.promotion_type === "percentage"
      ? "percentage"
      : row.promotion_type === "fixed_amount"
        ? "fixed"
        : row.promotion_type === "free_shipping"
          ? "free_shipping"
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
  /** Parallel to productIds, or per-line via `lines[].category`. */
  productCategories?: Record<string, string | null>;
  deliveryFee: number;
  promotionCode?: string | null;
  voucherCode?: string | null;
  customerUserId?: string | null;
  /** Till path: only promos flagged for the counter. Online path: online-flagged. */
  channel?: "online" | "counter";
}): Promise<CheckoutPromotionQuote> {
  const channel = input.channel || "online";
  const categoryByProduct = new Map<string, string | null>();
  for (const line of input.lines) {
    if (line.productId && line.category !== undefined && !categoryByProduct.has(line.productId)) {
      categoryByProduct.set(line.productId, line.category);
    }
  }
  for (const [productId, category] of Object.entries(input.productCategories || {})) {
    if (!categoryByProduct.has(productId)) categoryByProduct.set(productId, category);
  }
  const targetedLines = input.lines.map((line, index) => ({
    productId: line.productId || input.productIds[index] || input.productIds[0] || "",
    category: (line.productId ? categoryByProduct.get(line.productId) : null) ?? line.category ?? null,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
  }));
  // Backfill product ids for callers that only sent lines.
  const requestedCode = input.promotionCode?.trim().toUpperCase() || null;
  const normalizedCode = requestedCode && requestedCode.length <= 64 ? requestedCode : null;
  const requestedVoucherCode = input.voucherCode?.trim() || null;
  const normalizedVoucherCode = requestedVoucherCode && requestedVoucherCode.length <= 64 ? requestedVoucherCode : null;
  const automaticData = await fetchAutomaticPromotions();

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
      const promotionData = await fetchPromotionsByIds([codeRow.promotion_id]);
      couponRow = (promotionData[0] as PromotionRow | undefined) || null;
      if (!couponRow) invalidCodeReason = "That promotion code is not valid.";
    }
  }

  const channelAllowed = (row: PromotionRow) =>
    channel === "counter" ? row.available_at_counter !== false && row.available_at_counter === true : row.available_online !== false;
  const onlineAutomatic = ((automaticData || []) as PromotionRow[]).filter(channelAllowed);
  if (couponRow && !channelAllowed(couponRow)) {
    invalidCodeReason = "That promotion code is not valid for this checkout.";
    couponRow = null;
  }
  // The till is automatic-only: it has no code box, so a typed code can never
  // apply there even if one is somehow supplied.
  if (channel === "counter") {
    couponRow = null;
  }

  const rows = [...onlineAutomatic, ...(couponRow ? [couponRow] : [])];
  const promotionIds = [...new Set(rows.map((row) => row.id))];
  const [redemptionResult, productRuleResult, categoryRuleResult] = promotionIds.length
    ? await Promise.all([
        supabaseAdmin.from("promotion_redemptions").select("promotion_id,user_id").in("promotion_id", promotionIds),
        supabaseAdmin.from("promotion_products").select("promotion_id,product_id,is_excluded").in("promotion_id", promotionIds),
        supabaseAdmin.from("promotion_categories").select("promotion_id,category,is_excluded").in("promotion_id", promotionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (redemptionResult.error || productRuleResult.error) {
    throw new Error("Could not validate active promotions.");
  }
  // A missing `promotion_categories` table (migration unapplied) means no
  // category rules, not a failed checkout.
  const redemptionData = redemptionResult.data;
  const productRuleData = productRuleResult.data;
  const categoryRuleData = categoryRuleResult.error ? [] : categoryRuleResult.data;

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
  const categoryRules = (categoryRuleData || []) as Array<{
    promotion_id: string;
    category: string;
    is_excluded: boolean;
  }>;

  const eligible = (row: PromotionRow, codeUsageCount = 0) => {
    const campaign = toCampaign(row, Math.max(usageByPromotion.get(row.id) || 0, codeUsageCount));
    if (!campaign) {
      return { promotion: null, reason: "This promotion type is not available online.", eligibleSubtotal: 0 };
    }
    const rules = productRules.filter((rule) => rule.promotion_id === row.id);
    const catRules = categoryRules.filter((rule) => rule.promotion_id === row.id);
    const { eligibleLines, eligibleSubtotal } = matchPromotionTargeting(targetedLines, {
      includedProductIds: rules.filter((rule) => !rule.is_excluded).map((rule) => rule.product_id),
      excludedProductIds: rules.filter((rule) => rule.is_excluded).map((rule) => rule.product_id),
      includedCategories: catRules.filter((rule) => !rule.is_excluded).map((rule) => rule.category),
      excludedCategories: catRules.filter((rule) => rule.is_excluded).map((rule) => rule.category),
    });
    if (eligibleLines.length === 0) {
      return {
        promotion: null,
        reason: "This promotion does not apply to any item in your cart.",
        eligibleSubtotal: 0,
      };
    }
    const result = evaluatePromotionEligibility(campaign, {
      subtotal: eligibleSubtotal,
      now: new Date(),
      customerUsageCount: customerUsageByPromotion.get(row.id) || 0,
    });
    if (!result.eligible) return { promotion: null, reason: result.reason, eligibleSubtotal };
    // Free delivery is order-level: once any line matches, the fee decision is
    // settled by `resolvePromotionStack` below. Discounts are pro-rated to the
    // matching lines via `eligibleSubtotal`.
    const promotion =
      result.promotion.kind === "free_shipping"
        ? result.promotion
        : { ...result.promotion, eligibleSubtotal };
    return { promotion, reason: null, eligibleSubtotal };
  };

  const eligibleAutomatic = onlineAutomatic
    .map((row) => eligible(row).promotion)
    .filter((promotion): promotion is EligiblePromotion => Boolean(promotion));
  const couponResult = couponRow ? eligible(couponRow, codeRow?.usage_count || 0) : null;
  const couponPromotion = couponResult?.promotion || null;

  const discountAutomatic = eligibleAutomatic.filter(isDiscountPromotion);
  const discountCoupon =
    couponPromotion && isDiscountPromotion(couponPromotion) ? couponPromotion : undefined;

  // Priced with no delivery fee, purely to learn which discounts `quoteOrder`
  // keeps and what they are worth. Free delivery is then settled against that,
  // because the two are one decision: an offer marked "do not stack" must not
  // end up alongside another one just because the other is about delivery.
  const discountOnly = quoteOrder({
    lines: input.lines,
    automaticPromotions: discountAutomatic,
    coupon: discountCoupon,
    deliveryFee: 0,
    rewardCredit: 0,
  });
  const appliedDiscountIds = new Set(discountOnly.appliedPromotionIds);
  const appliedDiscounts = [
    ...discountAutomatic,
    ...(discountCoupon ? [discountCoupon] : []),
  ].filter((promotion) => appliedDiscountIds.has(promotion.id));

  // Free delivery is not a discount on merchandise, so it is settled here
  // rather than inside `quoteOrder`. Only one is ever "applied": the fee is
  // charged or it is not, and recording two would burn two usage limits for
  // one order. A typed code wins over an automatic offer so the customer sees
  // the code they entered take effect; between automatic offers a stackable one
  // is preferred, because it can sit beside a discount instead of displacing it.
  const couponFreeShipping =
    couponPromotion && couponPromotion.kind === "free_shipping" ? couponPromotion : null;
  const automaticFreeShipping = eligibleAutomatic.filter(
    (promotion) => promotion.kind === "free_shipping",
  );
  const stack = resolvePromotionStack({
    appliedDiscounts,
    discountTotal: discountOnly.discount,
    freeDelivery:
      couponFreeShipping ??
      automaticFreeShipping.find((promotion) => promotion.stackable) ??
      automaticFreeShipping[0] ??
      null,
    deliveryFee: input.deliveryFee,
  });
  const appliedFreeShipping = stack.freeDelivery;
  const pricedAutomatic = stack.keepDiscounts ? discountAutomatic : [];
  const pricedCoupon = stack.keepDiscounts ? discountCoupon : undefined;
  const deliveryFee = deliveryFeeAfterPromotions(
    input.deliveryFee,
    appliedFreeShipping ? [appliedFreeShipping] : [],
  );

  const preliminaryQuote = quoteOrder({
    lines: input.lines,
    automaticPromotions: pricedAutomatic,
    coupon: pricedCoupon,
    deliveryFee,
    rewardCredit: 0,
  });

  const merchandiseAfterDiscount = Math.max(0, preliminaryQuote.subtotal - preliminaryQuote.discount);
  const finalVoucherResult = await resolveVoucherCredit({
    voucherCode: normalizedVoucherCode,
    customerUserId: input.customerUserId || null,
    merchandiseAfterDiscount,
  });

  const quote = quoteOrder({
    lines: input.lines,
    automaticPromotions: pricedAutomatic,
    coupon: pricedCoupon,
    deliveryFee,
    rewardCredit: finalVoucherResult.credit,
  });

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const eligibleById = new Map<string, number | undefined>([
    ...discountAutomatic.map((promotion) => [promotion.id, promotion.eligibleSubtotal] as const),
    ...(discountCoupon ? [[discountCoupon.id, discountCoupon.eligibleSubtotal] as const] : []),
  ]);
  // Free delivery goes last on purpose: the caller that writes
  // `applied_promotions` hands the remaining discount to the final entry, and
  // a free-delivery row has no merchandise discount to claim.
  const appliedIds = [
    ...quote.appliedPromotionIds,
    ...(appliedFreeShipping ? [appliedFreeShipping.id] : []),
  ];
  const appliedPromotions = appliedIds.flatMap((promotionId) => {
    const row = rowById.get(promotionId);
    const promotion = row ? toCampaign(row, 0) : null;
    if (!row || !promotion) return [];
    const isCoupon = couponRow?.id === promotionId;
    return [
      {
        promotionId,
        codeId: isCoupon ? codeRow?.id || null : null,
        code: isCoupon ? normalizedCode : null,
        name: row.name,
        kind: promotion.kind,
        // A free-delivery promotion carries no cash value; anything stored on
        // the row would otherwise be snapshotted as if it were money off.
        value: promotion.kind === "free_shipping" ? 0 : promotion.value,
        stackable: promotion.stackable,
        eligibleSubtotal: eligibleById.get(promotionId),
      },
    ];
  });
  const couponApplied = appliedPromotions.some((promotion) => promotion.code);
  const promotionCodeValid = !requestedCode || Boolean(couponPromotion);
  const promotionMessage = buildPromotionMessage({
    requestedCode,
    invalidCodeReason,
    couponApplied,
    couponRow,
    couponResult,
  });

  return {
    ...quote,
    appliedPromotions,
    promotionMessage,
    promotionCodeValid,
    voucherCode: normalizedVoucherCode,
    voucherCredit: finalVoucherResult.credit,
    voucherCodeValid: finalVoucherResult.valid,
    voucherMessage: finalVoucherResult.message,
  };
}

function buildPromotionMessage(input: {
  requestedCode: string | null;
  invalidCodeReason: string | null;
  couponApplied: boolean;
  couponRow: PromotionRow | null;
  couponResult: { promotion: EligiblePromotion | null; reason: string | null } | null;
}): string | null {
  if (!input.requestedCode) return null;
  if (input.invalidCodeReason) return input.invalidCodeReason;
  if (input.couponApplied) return `${input.couponRow?.name || "Promotion"} applied.`;
  if (input.couponResult?.promotion) return "A better active offer has been applied to your cart.";
  return input.couponResult?.reason || "That promotion code is not valid.";
}

type VoucherBalanceRow = {
  id: string;
  balance: number | string;
  status: string;
  expires_at: string | null;
  recipient_email: string | null;
  sender_user_id: string | null;
};

async function resolveVoucherCredit(input: {
  voucherCode: string | null;
  customerUserId: string | null;
  merchandiseAfterDiscount: number;
}): Promise<{ credit: number; valid: boolean; message: string | null }> {
  if (!input.voucherCode) {
    return { credit: 0, valid: true, message: null };
  }

  const { data, error } = await supabaseAdmin.rpc("get_voucher_balance", {
    p_code: input.voucherCode,
  });
  const row =
    !error && Array.isArray(data) ? ((data as VoucherBalanceRow[])[0] ?? null) : null;
  const voucher = row
    ? {
        balance: Number(row.balance),
        status: String(row.status),
        expiresAt: row.expires_at,
        recipientEmail: row.recipient_email,
      }
    : null;

  // Only look the shopper up when the voucher is reserved — an open voucher
  // needs no identity, and this runs on every quote request.
  const redeemerEmail = voucher?.recipientEmail
    ? await signedInCustomerEmail(input.customerUserId)
    : null;

  return resolveVoucherRedemption({
    voucher,
    redeemerEmail,
    merchandiseAfterDiscount: input.merchandiseAfterDiscount,
    now: new Date(),
  });
}

/**
 * The verified address of whoever is checking out, or null for a guest.
 *
 * Falls back to the auth record because `customer_profiles` is written by
 * `bootstrap_customer_account` after sign-in; a shopper whose profile row is
 * missing would otherwise be locked out of a voucher addressed to them.
 */
async function signedInCustomerEmail(customerUserId: string | null): Promise<string | null> {
  if (!customerUserId) return null;

  const { data: profile } = await supabaseAdmin
    .from("customer_profiles")
    .select("email")
    .eq("user_id", customerUserId)
    .maybeSingle();
  if (profile?.email) return String(profile.email);

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(customerUserId);
  return authUser?.user?.email || null;
}
