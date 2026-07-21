import { describe, expect, it } from "vitest";
import { evaluatePromotionEligibility } from "./promotion-eligibility";

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
});
