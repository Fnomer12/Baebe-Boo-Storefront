import { describe, expect, it } from "vitest";
import type { CounterCatalogItem } from "./catalog";
import { applySoldQuantities, availableStock, stockStatus } from "./stock";

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

describe("availableStock", () => {
  it("subtracts what is already reserved", () => {
    expect(availableStock({ onHand: 10, reserved: 3 })).toBe(7);
  });

  it("floors at zero when a row is over-reserved", () => {
    expect(availableStock({ onHand: 2, reserved: 5 })).toBe(0);
  });
});

describe("stockStatus", () => {
  it("reports out at or below zero", () => {
    expect(stockStatus(0)).toBe("out");
    expect(stockStatus(-1)).toBe("out");
  });

  it("reports low up to the threshold", () => {
    expect(stockStatus(1)).toBe("low");
    expect(stockStatus(3)).toBe("low");
  });

  it("reports healthy above the threshold", () => {
    expect(stockStatus(4)).toBe("healthy");
  });
});

describe("applySoldQuantities", () => {
  it("decrements the variant that was sold", () => {
    const items = [item({ variantId: "variant-1", onHand: 5 })];
    const next = applySoldQuantities(items, new Map([["variant-1", 2]]));
    expect(next[0].onHand).toBe(3);
  });

  it("leaves sibling variants of the same product alone", () => {
    const items = [
      item({ variantId: "variant-1", onHand: 5 }),
      item({ variantId: "variant-2", onHand: 5 }),
    ];
    const next = applySoldQuantities(items, new Map([["variant-1", 2]]));
    expect(next.map((row) => row.onHand)).toEqual([3, 5]);
  });

  it("never goes negative", () => {
    const items = [item({ onHand: 1 })];
    expect(applySoldQuantities(items, new Map([["variant-1", 9]]))[0].onHand).toBe(0);
  });

  it("ignores legacy rows that have no variant", () => {
    const items = [item({ variantId: null, onHand: 5 })];
    expect(applySoldQuantities(items, new Map([["variant-1", 2]]))[0].onHand).toBe(5);
  });

  it("returns the catalogue unchanged when nothing was sold", () => {
    const items = [item()];
    expect(applySoldQuantities(items, new Map())).toEqual(items);
  });
});
