import { describe, expect, it } from "vitest";
import { quoteOrder } from "./pricing";

describe("quoteOrder", () => {
  it("applies the best automatic promotion and a stackable coupon", () => {
    const quote = quoteOrder({
      lines: [
        { variantId: "romper", unitPrice: 100, quantity: 2 },
        { variantId: "bottle", unitPrice: 50, quantity: 1 },
      ],
      automaticPromotions: [
        { id: "summer-10", kind: "percentage", value: 10, stackable: true },
        { id: "flat-15", kind: "fixed", value: 15, stackable: true },
      ],
      coupon: { id: "family-20", kind: "fixed", value: 20, stackable: true },
      deliveryFee: 25,
      rewardCredit: 10,
    });

    expect(quote).toEqual({
      subtotal: 250,
      discount: 45,
      rewardCredit: 10,
      deliveryFee: 25,
      total: 220,
      appliedPromotionIds: ["summer-10", "family-20"],
    });
  });

  it("never returns a negative payable total", () => {
    const quote = quoteOrder({
      lines: [{ variantId: "bib", unitPrice: 10, quantity: 1 }],
      automaticPromotions: [],
      coupon: { id: "gift", kind: "fixed", value: 50, stackable: false },
      deliveryFee: 0,
      rewardCredit: 50,
    });

    expect(quote.total).toBe(0);
    expect(quote.discount).toBe(10);
    expect(quote.rewardCredit).toBe(0);
  });
});
