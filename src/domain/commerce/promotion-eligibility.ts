import type { Promotion } from "./pricing";

/**
 * What a promotion does, as far as checkout is concerned.
 *
 * `pricing.ts` only knows how to take money off the merchandise line, so its
 * `Promotion["kind"]` is `percentage | fixed`. Free delivery is not a discount
 * on merchandise — it zeroes a different number — so it lives here as a third
 * kind and is applied by `deliveryFeeAfterPromotions` rather than by
 * `quoteOrder`.
 *
 * Before this, `free_shipping` was creatable in the admin and then answered
 * "This promotion type is not available online." at checkout, because the
 * mapping in `src/lib/checkout/promotions.ts` returned null for it.
 */
export type PromotionKind = Promotion["kind"] | "free_shipping";

export type PromotionCampaign = {
  id: string;
  kind: PromotionKind;
  value: number;
  status: "draft" | "active" | "paused" | "expired";
  startsAt: string | null;
  endsAt: string | null;
  minimumOrderAmount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  stackable: boolean;
};

/** A campaign that passed every gate, ready to be priced. */
export type EligiblePromotion = {
  id: string;
  kind: PromotionKind;
  value: number;
  stackable: boolean;
  /** Matching-lines subtotal for targeted promos; absent means whole basket. */
  eligibleSubtotal?: number;
};

type EligibilityResult =
  | { eligible: true; promotion: EligiblePromotion }
  | { eligible: false; reason: string };

const formatCedis = (amount: number) =>
  new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 }).format(amount);

export function evaluatePromotionEligibility(
  campaign: PromotionCampaign,
  input: { subtotal: number; now: Date; customerUsageCount?: number },
): EligibilityResult {
  if (campaign.status !== "active") {
    return { eligible: false, reason: "This promotion is not active." };
  }

  const now = input.now.getTime();
  if (campaign.startsAt && now < new Date(campaign.startsAt).getTime()) {
    return { eligible: false, reason: "This promotion has not started yet." };
  }
  if (campaign.endsAt && now >= new Date(campaign.endsAt).getTime()) {
    return { eligible: false, reason: "This promotion has expired." };
  }
  if (
    campaign.usageLimit !== null &&
    campaign.usageCount >= campaign.usageLimit
  ) {
    return {
      eligible: false,
      reason: "This promotion has reached its usage limit.",
    };
  }
  if (
    campaign.minimumOrderAmount !== null &&
    input.subtotal < campaign.minimumOrderAmount
  ) {
    return {
      eligible: false,
      reason: `This promotion requires a minimum order of GH₵${formatCedis(campaign.minimumOrderAmount)}.`,
    };
  }
  if (
    campaign.perCustomerLimit !== null &&
    (input.customerUsageCount || 0) >= campaign.perCustomerLimit
  ) {
    return {
      eligible: false,
      reason: "You have reached the use limit for this promotion.",
    };
  }

  return {
    eligible: true,
    promotion: {
      id: campaign.id,
      kind: campaign.kind,
      value: campaign.value,
      stackable: campaign.stackable,
    },
  };
}

/**
 * Narrows to the promotions `quoteOrder` can actually price.
 *
 * A free-delivery promotion has no merchandise discount to contribute, so
 * handing it to `quoteOrder` would either be ignored silently or — worse, when
 * its `value` is non-zero — taken off the basket as if it were cash off.
 */
export function isDiscountPromotion(
  promotion: EligiblePromotion,
): promotion is Promotion {
  return promotion.kind !== "free_shipping";
}

/** What actually applies to one basket once `stackable` has been honoured. */
export type PromotionStack = {
  /** False when free delivery displaced the merchandise discount entirely. */
  keepDiscounts: boolean;
  freeDelivery: EligiblePromotion | null;
};

/**
 * Settles a free-delivery offer against the discounts `quoteOrder` chose.
 *
 * THE BUG THIS FIXES
 * ------------------
 * Free delivery used to be picked with a plain `.find()` and applied no matter
 * what else was on the basket, so `stackable` — the flag whose entire job is to
 * stop two offers landing on one order — was skipped for half the promotions in
 * the table. A non-stackable "free delivery weekend" and a non-stackable "20%
 * off" both came off the same order, and the shop paid for both.
 *
 * `stackable` is a property of each offer, not of the pair, so one refusal is
 * enough to stop them combining. When they cannot combine, exactly one applies,
 * and it is chosen the same way `quoteOrder` chooses between two discounts:
 * whichever is worth more to the customer, with the delivery fee standing in
 * for what free delivery is worth. A tie keeps the merchandise discount.
 */
export function resolvePromotionStack(input: {
  /** The discount promotions `quoteOrder` actually applied, not the candidates. */
  appliedDiscounts: readonly EligiblePromotion[];
  /** What those discounts take off the basket, in cedis. */
  discountTotal: number;
  freeDelivery: EligiblePromotion | null;
  deliveryFee: number;
}): PromotionStack {
  const { freeDelivery } = input;
  if (!freeDelivery) return { keepDiscounts: true, freeDelivery: null };
  if (input.appliedDiscounts.length === 0) {
    return { keepDiscounts: true, freeDelivery };
  }

  const combines =
    freeDelivery.stackable && input.appliedDiscounts.every((promotion) => promotion.stackable);
  if (combines) return { keepDiscounts: true, freeDelivery };

  const freeDeliveryWorth = Number.isFinite(input.deliveryFee) ? Math.max(0, input.deliveryFee) : 0;
  return freeDeliveryWorth > input.discountTotal
    ? { keepDiscounts: false, freeDelivery }
    : { keepDiscounts: true, freeDelivery: null };
}

/**
 * The delivery fee once free-delivery promotions have had their say.
 *
 * Free delivery does not stack with anything in a meaningful way: the fee is
 * either charged or it is not, so one eligible promotion is enough.
 */
export function deliveryFeeAfterPromotions(
  deliveryFee: number,
  promotions: readonly EligiblePromotion[],
): number {
  const fee = Number.isFinite(deliveryFee) ? Math.max(0, deliveryFee) : 0;
  return promotions.some((promotion) => promotion.kind === "free_shipping")
    ? 0
    : fee;
}
