import { describe, expect, it } from "vitest";
import { promotionProductRows } from "./promotion-targeting";

const promotionId = "11111111-1111-4111-8111-111111111111";
const bibs = "22222222-2222-4222-8222-222222222222";
const socks = "33333333-3333-4333-8333-333333333333";

describe("promotionProductRows", () => {
  // `promotion_products` has been read at checkout since the first commerce
  // migration and no admin screen ever wrote a row, so every promotion applied
  // to the entire catalogue.
  it("writes an included row per chosen product", () => {
    expect(promotionProductRows(promotionId, { productIds: [bibs, socks] })).toEqual([
      { promotion_id: promotionId, product_id: bibs, is_excluded: false },
      { promotion_id: promotionId, product_id: socks, is_excluded: false },
    ]);
  });

  it("writes an excluded row per product held back from the offer", () => {
    expect(promotionProductRows(promotionId, { excludedProductIds: [socks] })).toEqual([
      { promotion_id: promotionId, product_id: socks, is_excluded: true },
    ]);
  });

  it("returns nothing when the promotion applies to everything", () => {
    expect(promotionProductRows(promotionId, {})).toEqual([]);
  });

  // (promotion_id, product_id) is the primary key, so a repeat would make the
  // whole insert fail and roll the promotion back.
  it("dedupes a product chosen twice", () => {
    expect(promotionProductRows(promotionId, { productIds: [bibs, bibs] })).toHaveLength(1);
  });

  it("lets exclusion win when a product somehow lands on both lists", () => {
    expect(
      promotionProductRows(promotionId, { productIds: [bibs], excludedProductIds: [bibs] }),
    ).toEqual([{ promotion_id: promotionId, product_id: bibs, is_excluded: true }]);
  });
});
