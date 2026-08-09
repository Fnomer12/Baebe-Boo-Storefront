import { describe, expect, it } from "vitest";
import {
  deliveryFeeAfterPromotions,
  evaluatePromotionEligibility,
  isDiscountPromotion,
  resolvePromotionStack,
} from "./promotion-eligibility";

const activePromotion = {
  id: "family-10",
  kind: "percentage" as const,
  value: 10,
  status: "active" as const,
  startsAt: "2026-07-01T00:00:00.000Z",
  endsAt: "2026-08-01T00:00:00.000Z",
  minimumOrderAmount: 100,
  usageLimit: 50,
  usageCount: 12,
  perCustomerLimit: 2,
  stackable: false,
};

describe("evaluatePromotionEligibility", () => {
  it("accepts an active campaign when the basket meets its minimum", () => {
    expect(
      evaluatePromotionEligibility(activePromotion, {
        subtotal: 180,
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).toEqual({
      eligible: true,
      promotion: {
        id: "family-10",
        kind: "percentage",
        value: 10,
        stackable: false,
      },
    });
  });

  it("rejects expired, exhausted, and below-minimum campaigns with a customer-safe reason", () => {
    expect(
      evaluatePromotionEligibility(
        { ...activePromotion, endsAt: "2026-07-20T00:00:00.000Z" },
        { subtotal: 180, now: new Date("2026-07-21T12:00:00.000Z") },
      ),
    ).toEqual({ eligible: false, reason: "This promotion has expired." });

    expect(
      evaluatePromotionEligibility(
        { ...activePromotion, usageCount: 50 },
        { subtotal: 180, now: new Date("2026-07-21T12:00:00.000Z") },
      ),
    ).toEqual({ eligible: false, reason: "This promotion has reached its usage limit." });

    expect(
      evaluatePromotionEligibility(activePromotion, {
        subtotal: 99.99,
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).toEqual({ eligible: false, reason: "This promotion requires a minimum order of GH₵100." });
  });

  it("rejects a customer who has reached the per-customer limit", () => {
    expect(
      evaluatePromotionEligibility(activePromotion, {
        subtotal: 180,
        now: new Date("2026-07-21T12:00:00.000Z"),
        customerUsageCount: 2,
      }),
    ).toEqual({
      eligible: false,
      reason: "You have reached the use limit for this promotion.",
    });
  });

  // Bug: free_shipping was creatable in the admin but `toCampaign` mapped only
  // percentage and fixed_amount, so every free-delivery promotion answered
  // "This promotion type is not available online."
  it("accepts a free delivery campaign instead of calling the type unavailable", () => {
    expect(
      evaluatePromotionEligibility(
        { ...activePromotion, id: "free-delivery", kind: "free_shipping", value: 0 },
        { subtotal: 180, now: new Date("2026-07-21T12:00:00.000Z") },
      ),
    ).toEqual({
      eligible: true,
      promotion: { id: "free-delivery", kind: "free_shipping", value: 0, stackable: false },
    });
  });

  it("holds free delivery to the same window and minimum as any other campaign", () => {
    const freeDelivery = {
      ...activePromotion,
      id: "free-delivery",
      kind: "free_shipping" as const,
      value: 0,
    };

    expect(
      evaluatePromotionEligibility(freeDelivery, {
        subtotal: 40,
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).toEqual({
      eligible: false,
      reason: "This promotion requires a minimum order of GH₵100.",
    });

    expect(
      evaluatePromotionEligibility(freeDelivery, {
        subtotal: 180,
        now: new Date("2026-06-01T12:00:00.000Z"),
      }),
    ).toEqual({ eligible: false, reason: "This promotion has not started yet." });
  });
});

describe("deliveryFeeAfterPromotions", () => {
  const percentOff = { id: "p", kind: "percentage" as const, value: 10, stackable: false };
  const freeDelivery = { id: "f", kind: "free_shipping" as const, value: 0, stackable: true };

  it("zeroes the delivery fee when free delivery applies", () => {
    expect(deliveryFeeAfterPromotions(35, [freeDelivery])).toBe(0);
    expect(deliveryFeeAfterPromotions(35, [percentOff, freeDelivery])).toBe(0);
  });

  it("leaves the fee alone when no free delivery promotion is eligible", () => {
    expect(deliveryFeeAfterPromotions(35, [])).toBe(35);
    expect(deliveryFeeAfterPromotions(35, [percentOff])).toBe(35);
  });

  it("never returns a negative or non-finite fee", () => {
    expect(deliveryFeeAfterPromotions(-5, [])).toBe(0);
    expect(deliveryFeeAfterPromotions(Number.NaN, [])).toBe(0);
  });

  // A free-delivery row carrying a stray `value` must never reach quoteOrder,
  // or "free delivery" silently becomes cash off the basket.
  it("keeps free delivery out of the promotions quoteOrder prices", () => {
    const strayValue = { id: "f", kind: "free_shipping" as const, value: 500, stackable: false };
    expect([percentOff, strayValue].filter(isDiscountPromotion)).toEqual([percentOff]);
  });
});

describe("resolvePromotionStack", () => {
  const discount = (stackable: boolean) => ({
    id: "twenty-off",
    kind: "fixed" as const,
    value: 20,
    stackable,
  });
  const freeDelivery = (stackable: boolean) => ({
    id: "free-delivery",
    kind: "free_shipping" as const,
    value: 0,
    stackable,
  });

  // THE BUG: free delivery was picked with a plain `.find()` and applied
  // regardless of `stackable`, so a non-stackable free-delivery offer and a
  // non-stackable discount both came off one basket and the shop paid twice.
  it("refuses to combine a non-stackable free delivery with a discount", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(true)],
        discountTotal: 20,
        freeDelivery: freeDelivery(false),
        deliveryFee: 35,
      }),
    ).toEqual({ keepDiscounts: false, freeDelivery: freeDelivery(false) });
  });

  it("refuses to combine free delivery with a non-stackable discount", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(false)],
        discountTotal: 20,
        freeDelivery: freeDelivery(true),
        deliveryFee: 35,
      }),
    ).toEqual({ keepDiscounts: false, freeDelivery: freeDelivery(true) });
  });

  // Which of the two survives is settled the way quoteOrder settles two
  // discounts: the customer keeps whichever is worth more.
  it("keeps the discount when it beats the delivery fee it would displace", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(false)],
        discountTotal: 20,
        freeDelivery: freeDelivery(false),
        deliveryFee: 15,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: null });
  });

  it("keeps the discount on a tie, and on a pickup order with no fee at all", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(false)],
        discountTotal: 35,
        freeDelivery: freeDelivery(false),
        deliveryFee: 35,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: null });
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(false)],
        discountTotal: 20,
        freeDelivery: freeDelivery(false),
        deliveryFee: 0,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: null });
  });

  it("lets two stackable offers apply together", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(true)],
        discountTotal: 20,
        freeDelivery: freeDelivery(true),
        deliveryFee: 35,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: freeDelivery(true) });
  });

  it("applies a non-stackable free delivery when nothing else is on the basket", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [],
        discountTotal: 0,
        freeDelivery: freeDelivery(false),
        deliveryFee: 35,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: freeDelivery(false) });
  });

  it("leaves the discounts alone when there is no free delivery offer", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(false)],
        discountTotal: 20,
        freeDelivery: null,
        deliveryFee: 35,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: null });
  });

  // One refusal anywhere in the basket is enough: the second discount saying
  // "do not stack" has to count even when the first one is happy to.
  it("judges every applied discount, not just the first", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(true), { ...discount(false), id: "second" }],
        discountTotal: 20,
        freeDelivery: freeDelivery(true),
        deliveryFee: 10,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: null });
  });

  it("treats a nonsense delivery fee as worth nothing", () => {
    expect(
      resolvePromotionStack({
        appliedDiscounts: [discount(false)],
        discountTotal: 0,
        freeDelivery: freeDelivery(false),
        deliveryFee: Number.NaN,
      }),
    ).toEqual({ keepDiscounts: true, freeDelivery: null });
  });
});
