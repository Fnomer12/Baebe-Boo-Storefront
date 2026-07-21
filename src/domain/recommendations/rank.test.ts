import { describe, expect, it } from "vitest";
import { rankRecommendations } from "./rank";

describe("rankRecommendations", () => {
  it("prioritizes co-purchased and age-suitable products without customer PII", () => {
    const ranked = rankRecommendations(
      { id: "romper", category: "Clothing", age: "0–3 Months", price: 100 },
      [
        { id: "school-bag", category: "School", age: "6+ Years", price: 120 },
        { id: "newborn-hat", category: "Clothing", age: "0–3 Months", price: 50 },
        { id: "feeding-set", category: "Feeding", age: "6–12 Months", price: 90 },
      ],
      { coPurchaseCounts: { "newborn-hat": 8, "feeding-set": 20 } },
    );

    expect(ranked.map((item) => item.id)).toEqual(["newborn-hat", "feeding-set", "school-bag"]);
  });

  it("never recommends the product being viewed", () => {
    expect(
      rankRecommendations(
        { id: "romper", category: "Clothing", age: "0–3 Months", price: 100 },
        [{ id: "romper", category: "Clothing", age: "0–3 Months", price: 100 }],
      ),
    ).toEqual([]);
  });
});
