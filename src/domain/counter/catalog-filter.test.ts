import { describe, expect, it } from "vitest";
import type { CounterCatalogItem } from "./catalog";
import {
  ALL_AGE_RANGES,
  ALL_CATEGORIES,
  catalogAgeRanges,
  catalogCategories,
  filterCatalog,
  paginate,
} from "./catalog-filter";

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

const catalog = [
  item({ productId: "a", variantId: "a1", name: "Sleepsuit", sku: "BB-1", category: "Bodysuits", ageRange: "0-3 months" }),
  item({ productId: "b", variantId: "b1", name: "Romper", sku: "BB-2", category: "Rompers", ageRange: "3-6 months" }),
  item({ productId: "c", variantId: "c1", name: "Sun Hat", sku: "BB-3", category: "Accessories", ageRange: "" }),
];

describe("catalogCategories", () => {
  it("leads with the all-categories sentinel and sorts the rest", () => {
    expect(catalogCategories(catalog)).toEqual([
      ALL_CATEGORIES,
      "Accessories",
      "Bodysuits",
      "Rompers",
    ]);
  });

  it("deduplicates", () => {
    expect(catalogCategories([item(), item()])).toEqual([ALL_CATEGORIES, "Bodysuits"]);
  });
});

describe("catalogAgeRanges", () => {
  it("derives ranges from the data and skips blanks", () => {
    expect(catalogAgeRanges(catalog)).toEqual([
      ALL_AGE_RANGES,
      "0-3 months",
      "3-6 months",
    ]);
  });

  it("surfaces a label the old hard-coded list would have hidden", () => {
    const ranges = catalogAgeRanges([item({ ageRange: "Preemie" })]);
    expect(ranges).toContain("Preemie");
  });
});

describe("filterCatalog", () => {
  it("returns everything by default", () => {
    expect(filterCatalog(catalog, {})).toHaveLength(3);
  });

  it("matches name or sku, case insensitively", () => {
    expect(filterCatalog(catalog, { query: "romper" }).map((row) => row.productId)).toEqual(["b"]);
    expect(filterCatalog(catalog, { query: "bb-3" }).map((row) => row.productId)).toEqual(["c"]);
  });

  it("filters by category", () => {
    expect(filterCatalog(catalog, { category: "Rompers" }).map((row) => row.productId)).toEqual(["b"]);
  });

  it("filters by age range", () => {
    expect(filterCatalog(catalog, { ageRange: "0-3 months" }).map((row) => row.productId)).toEqual(["a"]);
  });

  it("combines filters", () => {
    expect(filterCatalog(catalog, { query: "s", category: "Bodysuits" }).map((row) => row.productId)).toEqual(["a"]);
    expect(filterCatalog(catalog, { query: "romper", category: "Bodysuits" })).toEqual([]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterCatalog(catalog, { query: "  romper  " })).toHaveLength(1);
  });
});

describe("paginate", () => {
  const rows = [1, 2, 3, 4, 5];

  it("slices the requested page", () => {
    expect(paginate(rows, 2, 2)).toEqual({ page: 2, totalPages: 3, rows: [3, 4] });
  });

  it("clamps past the last page instead of returning nothing", () => {
    expect(paginate(rows, 99, 2)).toEqual({ page: 3, totalPages: 3, rows: [5] });
  });

  it("clamps below the first page", () => {
    expect(paginate(rows, 0, 2).page).toBe(1);
  });

  it("reports one page for an empty list", () => {
    expect(paginate([], 1, 12)).toEqual({ page: 1, totalPages: 1, rows: [] });
  });
});
