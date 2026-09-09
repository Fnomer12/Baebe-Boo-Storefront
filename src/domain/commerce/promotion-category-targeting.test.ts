import { describe, expect, it } from "vitest";
import {
  matchPromotionTargeting,
  promotionCategoryRows,
} from "./promotion-targeting";

const promotionId = "11111111-1111-4111-8111-111111111111";

describe("promotionCategoryRows", () => {
  it("writes an included row per chosen category", () => {
    expect(
      promotionCategoryRows(promotionId, { categories: ["Feeding", "Toys"] }),
    ).toEqual([
      { promotion_id: promotionId, category: "Feeding", is_excluded: false },
      { promotion_id: promotionId, category: "Toys", is_excluded: false },
    ]);
  });

  it("lets exclusion win when a category lands on both lists", () => {
    expect(
      promotionCategoryRows(promotionId, {
        categories: ["Feeding"],
        excludedCategories: ["Feeding"],
      }),
    ).toEqual([{ promotion_id: promotionId, category: "Feeding", is_excluded: true }]);
  });

  it("trims and dedupes case-insensitively", () => {
    expect(
      promotionCategoryRows(promotionId, {
        categories: ["  Feeding ", "feeding"],
        excludedCategories: [" feeding "],
      }),
    ).toEqual([{ promotion_id: promotionId, category: "feeding", is_excluded: true }]);
  });
});

describe("matchPromotionTargeting", () => {
  const lines = [
    { productId: "p1", category: "Feeding", unitPrice: 100, quantity: 1 },
    { productId: "p2", category: "Toys", unitPrice: 200, quantity: 1 },
  ];

  it("matches the whole basket when there are no rules", () => {
    expect(matchPromotionTargeting(lines, {}).eligibleSubtotal).toBe(300);
  });

  it("pro-rates to the included category", () => {
    const match = matchPromotionTargeting(lines, { includedCategories: ["Feeding"] });
    expect(match.eligibleLines).toHaveLength(1);
    expect(match.eligibleSubtotal).toBe(100);
  });

  it("lets product exclusion beat category inclusion", () => {
    const match = matchPromotionTargeting(lines, {
      includedCategories: ["Feeding", "Toys"],
      excludedProductIds: ["p2"],
    });
    expect(match.eligibleLines.map((line) => line.productId)).toEqual(["p1"]);
  });

  it("lets category exclusion beat product inclusion", () => {
    const match = matchPromotionTargeting(lines, {
      includedProductIds: ["p1"],
      excludedCategories: ["Feeding"],
    });
    expect(match.eligibleLines).toHaveLength(0);
    expect(match.eligibleSubtotal).toBe(0);
  });

  it("matches either list when both inclusions exist", () => {
    const match = matchPromotionTargeting(lines, {
      includedProductIds: ["p1"],
      includedCategories: ["Toys"],
    });
    expect(match.eligibleLines).toHaveLength(2);
  });
});
