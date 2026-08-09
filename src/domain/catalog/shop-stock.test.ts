import { describe, expect, it } from "vitest";
import { expandStockPlan, rollUpByShop } from "./shop-stock";

const osu = "shop-osu";
const spintex = "shop-spintex";

describe("expandStockPlan", () => {
  it("writes one inventory row per variant per shop", () => {
    const rows = expandStockPlan(
      [{ key: "pink-3m" }, { key: "pink-6m" }],
      [
        { shopId: osu, onHand: 12, reorderPoint: 3 },
        { shopId: spintex, onHand: 4 },
      ],
    );

    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ variantKey: "pink-3m", shopId: osu, onHand: 12, reorderPoint: 3 });
    expect(rows[3]).toEqual({ variantKey: "pink-6m", shopId: spintex, onHand: 4, reorderPoint: 0 });
  });

  it("lets a per-variant count override the product-level one, shop by shop", () => {
    const rows = expandStockPlan(
      [{ key: "pink-3m", stock: [{ shopId: osu, onHand: 2 }] }],
      [
        { shopId: osu, onHand: 12 },
        { shopId: spintex, onHand: 4 },
      ],
    );

    expect(rows).toEqual([
      { variantKey: "pink-3m", shopId: osu, onHand: 2, reorderPoint: 0 },
      // Not overridden, so the product-level number still applies.
      { variantKey: "pink-3m", shopId: spintex, onHand: 4, reorderPoint: 0 },
    ]);
  });

  it("spreads a single product-level count across the grid, which is what it means", () => {
    // Documented rather than clever: "12 at Osu" on a four-variant product is
    // twelve of each, and the roll-up will say 48. It is why the editor asks
    // for stock per variant as soon as a product has options.
    const rows = expandStockPlan(
      [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }],
      [{ shopId: osu, onHand: 12 }],
    );
    expect(rollUpByShop(rows)).toEqual([{ shopId: osu, onHand: 48, isAvailable: true }]);
  });

  it("does not stock a shop the product was never allocated to", () => {
    const rows = expandStockPlan(
      [{ key: "pink-3m", stock: [{ shopId: "shop-not-chosen", onHand: 99 }] }],
      [{ shopId: osu, onHand: 1 }],
    );
    expect(rows.map((row) => row.shopId)).toEqual([osu]);
  });

  it("writes nothing when the product is not stocked anywhere", () => {
    expect(expandStockPlan([{ key: "pink-3m" }], [])).toEqual([]);
  });

  it("refuses to write a negative or fractional count", () => {
    const rows = expandStockPlan([{ key: "a" }], [{ shopId: osu, onHand: -5, reorderPoint: 2.7 }]);
    expect(rows[0]).toEqual({ variantKey: "a", shopId: osu, onHand: 0, reorderPoint: 2 });
  });
});

describe("rollUpByShop", () => {
  it("sums the siblings rather than copying the row that just changed", () => {
    // Setting the 6M to zero must not report the whole product out of stock
    // when there are nine 3M on the shelf.
    expect(
      rollUpByShop([
        { shopId: osu, onHand: 9 },
        { shopId: osu, onHand: 0 },
        { shopId: spintex, onHand: 2 },
      ]),
    ).toEqual([
      { shopId: osu, onHand: 9, isAvailable: true },
      { shopId: spintex, onHand: 2, isAvailable: true },
    ]);
  });

  it("reports a shop with nothing left as unavailable", () => {
    expect(rollUpByShop([{ shopId: osu, onHand: 0 }])).toEqual([
      { shopId: osu, onHand: 0, isAvailable: false },
    ]);
  });

  it("keeps a switched-off product off the shelf even when stock exists", () => {
    expect(rollUpByShop([{ shopId: osu, onHand: 9 }], { productIsActive: false })).toEqual([
      { shopId: osu, onHand: 9, isAvailable: false },
    ]);
  });

  it("returns a stable order so a diff of two roll-ups is readable", () => {
    expect(
      rollUpByShop([{ shopId: spintex, onHand: 1 }, { shopId: osu, onHand: 1 }]).map((row) => row.shopId),
    ).toEqual([osu, spintex]);
  });
});
