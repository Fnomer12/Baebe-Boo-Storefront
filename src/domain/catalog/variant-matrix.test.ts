import { describe, expect, it } from "vitest";
import { generateVariantSku, matrixSize, maxSkuLength, skuSegment, variantMatrix } from "./variant-matrix";

const colourThenSize = [
  { name: "Colour", values: ["Pink", "Blue"] },
  { name: "Size", values: ["3M", "6M"] },
];

describe("variantMatrix", () => {
  it("varies the FIRST option slowest, so the grid reads as one block per colour", () => {
    expect(variantMatrix(colourThenSize)).toEqual([
      { colour: "Pink", size: "3M" },
      { colour: "Pink", size: "6M" },
      { colour: "Blue", size: "3M" },
      { colour: "Blue", size: "6M" },
    ]);
  });

  it("keys combinations by the lowercase option name the jsonb uses", () => {
    expect(variantMatrix([{ name: " Shoe Size ", values: ["22"] }])).toEqual([{ "shoe size": "22" }]);
  });

  it("gives a product with no options exactly one variant, not none", () => {
    expect(variantMatrix([])).toEqual([{}]);
    expect(matrixSize([])).toBe(1);
  });

  it("gives an option with no values nothing to sell", () => {
    expect(variantMatrix([{ name: "Colour", values: [] }])).toEqual([]);
    expect(matrixSize([{ name: "Colour", values: [] }])).toBe(0);
  });

  it("stops at the cap instead of building 125,000 rows on a shop tablet", () => {
    const huge = [
      { name: "Colour", values: Array.from({ length: 50 }, (_, index) => `C${index}`) },
      { name: "Size", values: Array.from({ length: 50 }, (_, index) => `S${index}`) },
      { name: "Material", values: Array.from({ length: 50 }, (_, index) => `M${index}`) },
    ];
    expect(matrixSize(huge)).toBe(125_000);
    expect(variantMatrix(huge)).toHaveLength(100);
  });

  it("truncates to a true prefix, so the rows kept are the rows that would have been first", () => {
    expect(variantMatrix(colourThenSize, 3)).toEqual(variantMatrix(colourThenSize).slice(0, 3));
    expect(variantMatrix(colourThenSize, 1)).toEqual([{ colour: "Pink", size: "3M" }]);
    expect(variantMatrix(colourThenSize, 0)).toEqual([]);
  });
});

describe("skuSegment", () => {
  it("folds the en-dash a supplier sheet pastes in", () => {
    // "3–6 Months" and "3-6 Months" are the same size typed by two people.
    expect(skuSegment("3–6 Months")).toBe("36MONTHS");
    expect(skuSegment("3-6 Months")).toBe("36MONTHS");
  });

  it("folds accents rather than dropping the whole word", () => {
    expect(skuSegment("Rosé")).toBe("ROSE");
    expect(skuSegment("Café Crème")).toBe("CAFECREME");
  });

  it("returns nothing for a value with no Latin letters or digits", () => {
    expect(skuSegment("粉红色")).toBe("");
    expect(skuSegment("   ")).toBe("");
    expect(skuSegment(null)).toBe("");
  });
});

describe("generateVariantSku", () => {
  it("reads as the product stem plus the choice", () => {
    expect(generateVariantSku("BB-SEED-001", { colour: "Pink", size: "3M" }, colourThenSize)).toBe(
      "BB-SEED-001-PINK-3M",
    );
  });

  it("orders segments by the declared options, not by the selection's key order", () => {
    expect(generateVariantSku("BB-1", { size: "3M", colour: "Pink" }, colourThenSize)).toBe("BB-1-PINK-3M");
  });

  it("suffixes rather than colliding — variant SKUs are unique across the whole table", () => {
    const taken = new Set(["BB-1-PINK", "BB-1-PINK-2"]);
    expect(generateVariantSku("BB-1", { colour: "Pink" }, colourThenSize, taken)).toBe("BB-1-PINK-3");
  });

  it("treats a differently-cased SKU as taken: a stockroom cannot tell them apart", () => {
    expect(generateVariantSku("bb-1", { colour: "Pink" }, colourThenSize, ["BB-1-PINK"])).toBe("BB-1-PINK-2");
  });

  it("trims the BASE, never the segments, to fit the cap", () => {
    const base = "B".repeat(120);
    const sku = generateVariantSku(base, { colour: "Pink", size: "3M" }, colourThenSize);
    expect(sku).toHaveLength(maxSkuLength);
    expect(sku.endsWith("-PINK-3M")).toBe(true);
  });

  it("keeps the collision suffix when even the segments overflow", () => {
    const options = [{ name: "Colour", values: ["x"] }];
    const monster = "M".repeat(200);
    const sku = generateVariantSku("BB-1", { colour: monster }, options, [
      generateVariantSku("BB-1", { colour: monster }, options),
    ]);
    expect(sku.length).toBeLessThanOrEqual(maxSkuLength);
    expect(sku.endsWith("-2")).toBe(true);
  });

  it("still produces a usable SKU when nothing transliterates", () => {
    const sku = generateVariantSku("", { colour: "粉红色" }, [{ name: "Colour", values: ["粉红色"] }]);
    expect(sku).toBe("SKU");
    expect(sku).toMatch(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
  });

  it("produces SKUs that pass the admin schema's SKU rule", () => {
    for (const selection of variantMatrix(colourThenSize)) {
      expect(generateVariantSku("BB-SEED-001", selection, colourThenSize)).toMatch(
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
      );
    }
  });
});
