import { describe, expect, it } from "vitest";
import {
  groupCatalogByProduct,
  needsVariantPicker,
  soleSellableVariant,
  variantLabel,
} from "./grouping";
import type { CounterCatalogItem } from "./catalog";

function item(overrides: Partial<CounterCatalogItem> = {}): CounterCatalogItem {
  return {
    productId: "product-1",
    variantId: "variant-1",
    name: "Bear Hoodie",
    category: "Baby Clothing",
    ageRange: "0–3 Months",
    gender: "Unisex",
    sku: "BB-001-01",
    price: 120,
    imageUrl: "https://example.test/hoodie.jpg",
    onHand: 7,
    reserved: 0,
    variantTitle: "Pink / 3M",
    optionValues: { color: "Pink", size: "3M" },
    ...overrides,
  };
}

describe("groupCatalogByProduct", () => {
  it("collapses four versions of one product into a single card", () => {
    // The reported bug: a 4-size hoodie rendered as four identical cards.
    const rows = [
      item({ variantId: "v1", sku: "BB-001-01", variantTitle: "Pink / 3M" }),
      item({ variantId: "v2", sku: "BB-001-02", variantTitle: "Pink / 6M" }),
      item({ variantId: "v3", sku: "BB-001-03", variantTitle: "Blue / 3M" }),
      item({ variantId: "v4", sku: "BB-001-04", variantTitle: "Blue / 6M" }),
    ];

    const groups = groupCatalogByProduct(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toHaveLength(4);
  });

  it("keeps separate products separate", () => {
    const groups = groupCatalogByProduct([
      item({ productId: "p1", name: "Bear Hoodie" }),
      item({ productId: "p2", name: "Cotton Bib", variantId: "v9" }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Bear Hoodie", "Cotton Bib"]);
  });

  it("sums available stock across versions", () => {
    const groups = groupCatalogByProduct([
      item({ variantId: "v1", onHand: 7, reserved: 0 }),
      item({ variantId: "v2", onHand: 5, reserved: 2 }),
    ]);

    // 7 + (5 - 2). Reserved stock is spoken for by an online order.
    expect(groups[0].available).toBe(10);
  });

  it("reports the price range so the card can say 'from'", () => {
    const groups = groupCatalogByProduct([
      item({ variantId: "v1", price: 120 }),
      item({ variantId: "v2", price: 135 }),
      item({ variantId: "v3", price: 125 }),
    ]);

    expect(groups[0].priceFrom).toBe(120);
    expect(groups[0].priceTo).toBe(135);
  });

  it("sorts products by name so the grid does not reshuffle", () => {
    const groups = groupCatalogByProduct([
      item({ productId: "p1", name: "Zebra Romper" }),
      item({ productId: "p2", name: "Anchor Vest", variantId: "v2" }),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Anchor Vest", "Zebra Romper"]);
  });

  it("puts sold-out versions last in the picker", () => {
    const groups = groupCatalogByProduct([
      item({ variantId: "v1", variantTitle: "Pink / 3M", onHand: 0 }),
      item({ variantId: "v2", variantTitle: "Blue / 6M", onHand: 4 }),
    ]);

    // The picker's job is to reach something sellable in one glance.
    expect(groups[0].variants[0].variantTitle).toBe("Blue / 6M");
  });

  it("borrows a photo from a sibling version when one row has none", () => {
    const groups = groupCatalogByProduct([
      item({ variantId: "v1", imageUrl: "" }),
      item({ variantId: "v2", imageUrl: "https://example.test/hoodie.jpg" }),
    ]);

    expect(groups[0].imageUrl).toBe("https://example.test/hoodie.jpg");
  });

  it("returns nothing for an empty shelf", () => {
    expect(groupCatalogByProduct([])).toEqual([]);
  });
});

describe("needsVariantPicker", () => {
  it("is false for a single-version product", () => {
    // A one-tap add must stay one tap; making every product cost two taps to
    // serve the minority that need a choice is a downgrade at a busy till.
    const [group] = groupCatalogByProduct([item()]);
    expect(needsVariantPicker(group)).toBe(false);
  });

  it("is true once there is a choice to make", () => {
    const [group] = groupCatalogByProduct([
      item({ variantId: "v1" }),
      item({ variantId: "v2" }),
    ]);
    expect(needsVariantPicker(group)).toBe(true);
  });
});

describe("soleSellableVariant", () => {
  it("returns the only version when it can be sold", () => {
    const [group] = groupCatalogByProduct([item({ variantId: "v1" })]);
    expect(soleSellableVariant(group)?.variantId).toBe("v1");
  });

  it("returns nothing when the only version is out of stock", () => {
    const [group] = groupCatalogByProduct([item({ onHand: 0 })]);
    expect(soleSellableVariant(group)).toBeNull();
  });

  it("returns nothing for a legacy row with no variant", () => {
    // complete_counter_sale sells by variant, so such a row is displayable but
    // not sellable and the card has to say so rather than invent an id.
    const [group] = groupCatalogByProduct([item({ variantId: null })]);
    expect(soleSellableVariant(group)).toBeNull();
  });

  it("returns nothing when there is a choice to make", () => {
    const [group] = groupCatalogByProduct([
      item({ variantId: "v1" }),
      item({ variantId: "v2" }),
    ]);
    expect(soleSellableVariant(group)).toBeNull();
  });
});

describe("variantLabel", () => {
  it("prefers the structured option values over the authored title", () => {
    expect(variantLabel(item({ optionValues: { color: "Pink", size: "3M" } }))).toBe(
      "Pink · 3M",
    );
  });

  it("puts colour before size whatever order the database returns", () => {
    // option_values is jsonb, and Postgres sorts object keys by (length,
    // bytes) — so `size` comes back BEFORE `color` and a naive Object.values()
    // renders "3M · Pink". Caught on a real till, not in review.
    const fromDatabase = JSON.parse('{"size":"3M","color":"Pink"}');
    expect(Object.keys(fromDatabase)).toEqual(["size", "color"]);
    expect(variantLabel(item({ optionValues: fromDatabase }))).toBe("Pink · 3M");
  });

  it("orders unknown options after the known ones, alphabetically", () => {
    expect(
      variantLabel(
        item({ optionValues: { size: "3M", zzz: "Late", color: "Pink", aaa: "Early" } }),
      ),
    ).toBe("Pink · 3M · Early · Late");
  });

  it("falls back to the title when there are no option values", () => {
    expect(
      variantLabel(item({ optionValues: {}, variantTitle: "Large bundle" })),
    ).toBe("Large bundle");
  });

  it("falls back to the SKU rather than returning nothing", () => {
    // No version may ever render unlabelled — that is the original bug.
    expect(
      variantLabel(item({ optionValues: {}, variantTitle: null, sku: "BB-001-04" })),
    ).toBe("BB-001-04");
  });

  it("ignores blank option values", () => {
    expect(
      variantLabel(item({ optionValues: { color: "  ", size: "3M" } })),
    ).toBe("3M");
  });
});
