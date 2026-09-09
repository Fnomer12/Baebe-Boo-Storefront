import { describe, expect, it } from "vitest";
import { quoteOrder } from "./pricing";

describe("quoteOrder with targeted promotions", () => {
  it("pro-rates a percentage promo to the eligible subtotal", () => {
    const quote = quoteOrder({
      lines: [
        { variantId: "feeding-bottle", unitPrice: 150, quantity: 1 },
        { variantId: "toy-car", unitPrice: 500, quantity: 1 },
      ],
      automaticPromotions: [
        { id: "feeding-10", kind: "percentage", value: 10, stackable: true, eligibleSubtotal: 150 },
      ],
      deliveryFee: 0,
      rewardCredit: 0,
    });
    expect(quote.subtotal).toBe(650);
    expect(quote.discount).toBe(15);
    expect(quote.total).toBe(635);
    expect(quote.appliedPromotionIds).toEqual(["feeding-10"]);
  });

  it("caps a fixed promo at the eligible portion, not the whole cart", () => {
    const quote = quoteOrder({
      lines: [
        { variantId: "bib", unitPrice: 60, quantity: 1 },
        { variantId: "stroller", unitPrice: 2000, quantity: 1 },
      ],
      automaticPromotions: [
        { id: "big-500", kind: "fixed", value: 500, stackable: true, eligibleSubtotal: 60 },
      ],
      deliveryFee: 0,
      rewardCredit: 0,
    });
    expect(quote.discount).toBe(60);
    expect(quote.total).toBe(2000);
  });

  it("keeps untargeted promos on the whole basket", () => {
    const quote = quoteOrder({
      lines: [{ variantId: "bib", unitPrice: 100, quantity: 2 }],
      automaticPromotions: [{ id: "all-10", kind: "percentage", value: 10, stackable: true }],
      deliveryFee: 0,
      rewardCredit: 0,
    });
    expect(quote.discount).toBe(20);
  });
});
