import { describe, expect, it } from "vitest";
import {
  inventoryAdjustmentSchema,
  productCreateSchema,
  productPatchSchema,
  productVariantsReplaceSchema,
  variantInputSchema,
} from "./catalog-schemas";

describe("admin catalog request schemas", () => {
  it("accepts a complete product and rejects duplicate shop allocations", () => {
    const shopId = "8b9ad8fd-f1e5-4bd4-89ef-a4d702838658";
    const product = {
      name: "Organic Cotton Romper",
      description: "Soft everyday layer",
      category: "Clothing",
      ageRange: "0-3 months",
      gender: "Unisex",
      price: 129.5,
      availability: [{ shopId, onHand: 12 }],
    };

    expect(productCreateSchema.safeParse(product).success).toBe(true);
    expect(
      productCreateSchema.safeParse({
        ...product,
        availability: [
          { shopId, onHand: 12 },
          { shopId, onHand: 4 },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires product patches to contain a change", () => {
    expect(productPatchSchema.safeParse({}).success).toBe(false);
    expect(productPatchSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("accepts integer inventory counts and rejects negative stock", () => {
    expect(
      inventoryAdjustmentSchema.safeParse({
        onHand: 20,
        reorderPoint: 4,
      }).success,
    ).toBe(true);
    expect(
      inventoryAdjustmentSchema.safeParse({
        onHand: -1,
      }).success,
    ).toBe(false);
  });
});

const shopId = "8b9ad8fd-f1e5-4bd4-89ef-a4d702838658";
const otherShopId = "0c6a6d0e-2f6d-4c72-8a19-4e0b21a5f2c4";

const colourAndSize = [
  { name: "Colour", values: ["Pink", "Blue"] },
  { name: "Size", values: ["3M", "6M"] },
];

function graph(overrides: Record<string, unknown> = {}) {
  return {
    options: colourAndSize,
    availability: [{ shopId, onHand: 5 }],
    variants: [
      { optionValues: { colour: "Pink", size: "3M" }, price: 120, isDefault: true },
      { optionValues: { colour: "Blue", size: "6M" }, price: 140 },
    ],
    ...overrides,
  };
}

/** The message attached to a specific input, which is what the form renders. */
function errorAt(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, path: PropertyKey[]) {
  return result.error?.issues.find((issue) => issue.path.join(".") === path.join("."))?.message;
}

describe("variable product schemas", () => {
  it("still accepts a product with no options at all", () => {
    // The upload form does not know about variants yet, so its payload has to
    // keep parsing exactly as before. This is the backward-compatibility test.
    const parsed = productCreateSchema.safeParse({
      name: "Organic Cotton Romper",
      description: "Soft everyday layer",
      category: "Baby Clothing",
      ageRange: "0–3 Months",
      gender: "Unisex",
      price: 129.5,
      availability: [{ shopId, onHand: 12 }],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.options).toEqual([]);
    expect(parsed.data?.variants).toEqual([]);
  });

  it("accepts an option list with its grid", () => {
    const parsed = productVariantsReplaceSchema.safeParse(graph());
    expect(parsed.success).toBe(true);
    expect(parsed.data?.variants[1].isActive).toBe(true);
  });

  it("refuses a client-supplied variant name, which is how a product name became a size chip", () => {
    const result = variantInputSchema.safeParse({
      optionValues: { colour: "Pink" },
      price: 120,
      title: "Baby Girl Strawberry 100% Cotton 2-Way Zip Sleep & Play Pajamas - Pink",
    });

    expect(result.success).toBe(false);
    expect(errorAt(result, ["title"])).toMatch(/built from the options/);
  });

  it("stores option keys lowercase, the way the seed and every reader expect", () => {
    const parsed = variantInputSchema.safeParse({
      optionValues: { Colour: " Pink ", SIZE: "3M" },
      price: 120,
    });
    expect(parsed.data?.optionValues).toEqual({ colour: "Pink", size: "3M" });
  });

  it("rejects two options with the same name however they were cased", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({ options: [...colourAndSize, { name: "colour", values: ["Green"] }], variants: [] }),
    );
    expect(errorAt(result, ["options", 2, "name"])).toMatch(/already have an option/);
  });

  it("rejects a repeated value inside one option", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({ options: [{ name: "Colour", values: ["Pink", " pink "] }], variants: [] }),
    );
    expect(errorAt(result, ["options", 0, "values", 1])).toMatch(/already one of the Colour choices/);
  });

  it("rejects a variant that leaves an option unanswered", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({ variants: [{ optionValues: { colour: "Pink" }, price: 120, isDefault: true }] }),
    );
    expect(errorAt(result, ["variants", 0, "optionValues", "size"])).toBe("Choose a Size for this version.");
  });

  it("rejects a variant carrying an option the product does not offer", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          { optionValues: { colour: "Pink", size: "3M", material: "Cotton" }, price: 120, isDefault: true },
        ],
      }),
    );
    expect(errorAt(result, ["variants", 0, "optionValues", "material"])).toMatch(/does not offer/);
  });

  it("rejects a value that is not one of the declared choices", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({ variants: [{ optionValues: { colour: "Green", size: "3M" }, price: 120, isDefault: true }] }),
    );
    expect(errorAt(result, ["variants", 0, "optionValues", "colour"])).toMatch(/not one of the Colour choices/);
  });

  it("rejects the same combination twice, whatever case it was typed in", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          { optionValues: { colour: "Pink", size: "3M" }, price: 120, isDefault: true },
          { optionValues: { Colour: " pink ", Size: "3m" }, price: 130 },
        ],
      }),
    );
    expect(errorAt(result, ["variants", 1, "optionValues"])).toBe('"Pink / 3M" is already listed on row 1.');
  });

  it("rejects two versions claiming to be the one shown first", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          { optionValues: { colour: "Pink", size: "3M" }, price: 120, isDefault: true },
          { optionValues: { colour: "Blue", size: "6M" }, price: 140, isDefault: true },
        ],
      }),
    );
    expect(errorAt(result, ["variants", 1, "isDefault"])).toMatch(/Only one version/);
  });

  it("rejects a switched-off version being the one shown first", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          { optionValues: { colour: "Pink", size: "3M" }, price: 120, isDefault: true, isActive: false },
          { optionValues: { colour: "Blue", size: "6M" }, price: 140 },
        ],
      }),
    );
    expect(errorAt(result, ["variants", 0, "isDefault"])).toMatch(/has to be switched on/);
  });

  it("rejects stock for a shop the product is not sold in", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          {
            optionValues: { colour: "Pink", size: "3M" },
            price: 120,
            isDefault: true,
            stock: [{ shopId: otherShopId, onHand: 3 }],
          },
        ],
      }),
    );
    expect(errorAt(result, ["variants", 0, "stock", 0, "shopId"])).toMatch(/Add this shop/);
  });

  it("rejects the same shop twice inside one version's stock", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          {
            optionValues: { colour: "Pink", size: "3M" },
            price: 120,
            isDefault: true,
            stock: [
              { shopId, onHand: 3 },
              { shopId, onHand: 4 },
            ],
          },
        ],
      }),
    );
    expect(errorAt(result, ["variants", 0, "stock", 1, "shopId"])).toBe("Each shop can appear only once.");
  });

  it("rejects a was-price below the price, which the database would reject anyway", () => {
    const result = variantInputSchema.safeParse({
      optionValues: {},
      price: 120,
      compareAtPrice: 100,
    });
    expect(errorAt(result, ["compareAtPrice"])).toMatch(/higher than the price/);
  });

  it("rejects options declared with no grid generated for them", () => {
    const result = productVariantsReplaceSchema.safeParse(graph({ variants: [] }));
    expect(errorAt(result, ["variants"])).toMatch(/Generate the versions/);
  });

  it("rejects switching every version off", () => {
    const result = productVariantsReplaceSchema.safeParse(
      graph({
        variants: [
          { optionValues: { colour: "Pink", size: "3M" }, price: 120, isActive: false },
          { optionValues: { colour: "Blue", size: "6M" }, price: 140, isActive: false },
        ],
      }),
    );
    expect(errorAt(result, ["variants"])).toMatch(/at least one version/i);
  });

  it("holds the caps a shop tablet can survive", () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => ({
      optionValues: { colour: "Pink", size: `${index}M` },
      price: 10,
    }));
    expect(productVariantsReplaceSchema.safeParse(graph({ variants: tooMany })).success).toBe(false);

    const fourOptions = [...colourAndSize, { name: "Material", values: ["Cotton"] }, { name: "Fit", values: ["Slim"] }];
    expect(productVariantsReplaceSchema.safeParse(graph({ options: fourOptions })).success).toBe(false);

    const fiftyOneValues = [{ name: "Size", values: Array.from({ length: 51 }, (_, index) => `${index}M`) }];
    expect(productVariantsReplaceSchema.safeParse(graph({ options: fiftyOneValues })).success).toBe(false);
  });

  it("treats a blank id and a blank SKU as not provided", () => {
    const parsed = variantInputSchema.safeParse({ id: "", sku: "", optionValues: {}, price: 10 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ id: undefined, sku: undefined });
  });
});
