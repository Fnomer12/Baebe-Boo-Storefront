import { describe, expect, it } from "vitest";
import type { CounterCartLine, CounterCatalogItem } from "./catalog";
import {
  addCartLine,
  cartTotals,
  removeCartLine,
  setCartQuantity,
  soldQuantitiesByVariant,
  toSaleItems,
} from "./cart";

function item(overrides: Partial<CounterCatalogItem> = {}): CounterCatalogItem {
  return {
    productId: "product-1",
    variantId: "variant-1",
    name: "Sleepsuit",
    category: "Bodysuits",
    ageRange: "0-3 months",
    gender: "unisex",
    sku: "BB-1",
    price: 25,
    imageUrl: "",
    onHand: 5,
    reserved: 0,
    variantTitle: null,
    optionValues: {},
    ...overrides,
  };
}

function line(overrides: Partial<CounterCartLine> = {}): CounterCartLine {
  return {
    productId: "product-1",
    variantId: "variant-1",
    name: "Sleepsuit",
    sku: "BB-1",
    variantTitle: null,
    imageUrl: "",
    price: 25,
    quantity: 1,
    available: 5,
    ...overrides,
  };
}

describe("addCartLine", () => {
  it("adds a new line with quantity 1", () => {
    const lines = addCartLine([], item());
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].available).toBe(5);
  });

  it("bumps an existing line instead of duplicating it", () => {
    const lines = addCartLine(addCartLine([], item()), item());
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it("records available as on hand minus reserved", () => {
    const lines = addCartLine([], item({ onHand: 5, reserved: 2 }));
    expect(lines[0].available).toBe(3);
  });

  it("refuses an item with nothing sellable", () => {
    expect(addCartLine([], item({ onHand: 2, reserved: 2 }))).toEqual([]);
    expect(addCartLine([], item({ onHand: 0 }))).toEqual([]);
  });

  it("refuses a legacy item that has no variant to sell", () => {
    expect(addCartLine([], item({ variantId: null }))).toEqual([]);
  });

  it("will not bump a line past what is available", () => {
    const stocked = item({ onHand: 2, reserved: 0 });
    let lines = addCartLine([], stocked);
    lines = addCartLine(lines, stocked);
    lines = addCartLine(lines, stocked);
    expect(lines[0].quantity).toBe(2);
  });
});

describe("setCartQuantity", () => {
  it("clamps to what is available", () => {
    expect(setCartQuantity([line()], "variant-1", 99)[0].quantity).toBe(5);
  });

  it("removes the line at zero", () => {
    expect(setCartQuantity([line()], "variant-1", 0)).toEqual([]);
  });

  it("removes the line for a negative quantity rather than going negative", () => {
    expect(setCartQuantity([line()], "variant-1", -3)).toEqual([]);
  });

  it("floors a fractional quantity", () => {
    expect(setCartQuantity([line()], "variant-1", 2.9)[0].quantity).toBe(2);
  });

  it("leaves other lines untouched", () => {
    const lines = [line(), line({ variantId: "variant-2", quantity: 4 })];
    const next = setCartQuantity(lines, "variant-1", 3);
    expect(next.map((row) => [row.variantId, row.quantity])).toEqual([
      ["variant-1", 3],
      ["variant-2", 4],
    ]);
  });
});

describe("removeCartLine", () => {
  it("drops only the named variant", () => {
    const lines = [line(), line({ variantId: "variant-2" })];
    expect(removeCartLine(lines, "variant-1").map((row) => row.variantId)).toEqual([
      "variant-2",
    ]);
  });
});

describe("cartTotals", () => {
  it("sums units and money", () => {
    const lines = [line({ quantity: 2 }), line({ variantId: "variant-2", price: 10, quantity: 3 })];
    expect(cartTotals(lines)).toEqual({ lineCount: 2, units: 5, total: 80 });
  });

  it("is zero for an empty cart", () => {
    expect(cartTotals([])).toEqual({ lineCount: 0, units: 0, total: 0 });
  });

  it("rounds money to the cedi cent", () => {
    const lines = [line({ price: 10.005, quantity: 3 })];
    expect(cartTotals(lines).total).toBe(30.02);
  });
});

describe("toSaleItems", () => {
  it("emits variant id and quantity only", () => {
    expect(toSaleItems([line({ quantity: 2 })])).toEqual([
      { variantId: "variant-1", quantity: 2 },
    ]);
  });
});

describe("soldQuantitiesByVariant", () => {
  it("keys by variant, not product", () => {
    const lines = [
      line({ variantId: "variant-1", quantity: 2 }),
      line({ variantId: "variant-2", quantity: 1 }),
    ];
    const sold = soldQuantitiesByVariant(lines);
    expect(sold.get("variant-1")).toBe(2);
    expect(sold.get("variant-2")).toBe(1);
  });
});
