import { describe, expect, it } from "vitest";
import {
  defaultVariantTitle,
  isVariableProduct,
  optionKey,
  optionsFromVariants,
  parseProductOptions,
  resolveProductOptions,
  selectionSignature,
  selectionTitle,
  variantOptionValues,
} from "./product-options";

describe("optionKey", () => {
  it("lowercases and collapses whitespace so one attribute is not stored twice", () => {
    expect(optionKey(" Colour ")).toBe("colour");
    expect(optionKey("Shoe   Size")).toBe("shoe size");
  });

  it("survives the non-strings that come out of jsonb", () => {
    expect(optionKey(null)).toBe("");
    expect(optionKey(undefined)).toBe("");
    expect(optionKey(12)).toBe("12");
    expect(optionKey({})).toBe("");
  });
});

describe("parseProductOptions", () => {
  it("reads the declared array and keeps the seller's order", () => {
    // The order is the whole point of storing an array: an object would come
    // back size-first because jsonb sorts keys by (length, bytes).
    expect(
      parseProductOptions([
        { name: "Size", values: ["3M", "6M"] },
        { name: "Colour", values: ["Pink"] },
      ]),
    ).toEqual([
      { name: "Size", values: ["3M", "6M"] },
      { name: "Colour", values: ["Pink"] },
    ]);
  });

  it("parses jsonb that arrived as a string", () => {
    expect(parseProductOptions('[{"name":"Colour","values":["Pink"]}]')).toEqual([
      { name: "Colour", values: ["Pink"] },
    ]);
  });

  it("re-sorts the legacy object shape rather than trusting its key order", () => {
    // Postgres already destroyed whatever order this was written in, so
    // colour leads and size follows — never "3M · Pink".
    expect(parseProductOptions({ size: ["3M"], color: ["Pink"] })).toEqual([
      { name: "color", values: ["Pink"] },
      { name: "size", values: ["3M"] },
    ]);
  });

  it("returns nothing rather than throwing on garbage", () => {
    for (const garbage of [null, undefined, "", "not json", 7, [1, 2, 3], [{ values: ["Pink"] }]]) {
      expect(parseProductOptions(garbage)).toEqual([]);
    }
  });

  it("drops half-typed rows: an option with no values cannot make a variant", () => {
    expect(parseProductOptions([{ name: "Colour", values: [] }, { name: "Size", values: ["3M"] }])).toEqual([
      { name: "Size", values: ["3M"] },
    ]);
  });

  it("collapses duplicate names and values instead of rendering two pickers", () => {
    expect(
      parseProductOptions([
        { name: "Colour", values: [" Pink ", "pink", "Blue"] },
        { name: "colour", values: ["Green"] },
      ]),
    ).toEqual([{ name: "Colour", values: ["Pink", "Blue"] }]);
  });

  it("holds the caps so a broken import cannot render fifty pickers", () => {
    const options = parseProductOptions(
      Array.from({ length: 8 }, (_, index) => ({
        name: `Option ${index}`,
        values: Array.from({ length: 90 }, (_, value) => `V${value}`),
      })),
    );
    expect(options).toHaveLength(3);
    expect(options[0].values).toHaveLength(50);
  });
});

describe("optionsFromVariants", () => {
  it("derives colour before size, whatever order jsonb hands them back", () => {
    // This is the bug the counter already shipped: Object.entries on jsonb
    // returns `size` first because its key is shorter.
    const options = optionsFromVariants([
      { option_values: { size: "3M", color: "Pink" } },
      { option_values: { size: "6M", color: "Blue" } },
    ]);

    expect(options).toEqual([
      { name: "Color", values: ["Pink", "Blue"] },
      { name: "Size", values: ["3M", "6M"] },
    ]);
  });

  it("names an option so that it still finds its own jsonb key", () => {
    const [option] = optionsFromVariants([{ option_values: { "shoe size": "22" } }]);
    expect(option.name).toBe("Shoe Size");
    expect(optionKey(option.name)).toBe("shoe size");
  });

  it("reads camelCase rows from the admin mappers as well as raw DB rows", () => {
    expect(optionsFromVariants([{ optionValues: { colour: "Navy" } }])).toEqual([
      { name: "Colour", values: ["Navy"] },
    ]);
  });

  it("leaves a discontinued value off the page", () => {
    expect(
      optionsFromVariants([
        { option_values: { color: "Pink" }, is_active: true },
        { option_values: { color: "Blue" }, is_active: false },
      ]),
    ).toEqual([{ name: "Color", values: ["Pink"] }]);
  });

  it("still reads a product whose variants are ALL switched off", () => {
    // Otherwise the editor opens it as a simple product and the next save
    // deactivates rows that can never be deleted.
    expect(
      optionsFromVariants([
        { option_values: { color: "Pink" }, is_active: false },
        { option_values: { color: "Blue" }, is_active: false },
      ]),
    ).toEqual([{ name: "Color", values: ["Pink", "Blue"] }]);
  });

  it("ignores rows with no structured options at all", () => {
    expect(optionsFromVariants([{ option_values: null }, { option_values: "Default Title" }])).toEqual([]);
  });
});

describe("resolveProductOptions", () => {
  it("uses the declared list when there is one", () => {
    expect(
      resolveProductOptions([{ name: "Colour", values: ["Pink", "Blue"] }], [
        { option_values: { colour: "Pink" } },
      ]),
    ).toEqual([{ name: "Colour", values: ["Pink", "Blue"] }]);
  });

  it("falls back to the variants, which is what makes this work before the migration lands", () => {
    expect(resolveProductOptions(null, [{ option_values: { color: "Pink", size: "3M" } }])).toEqual([
      { name: "Color", values: ["Pink"] },
      { name: "Size", values: ["3M"] },
    ]);
  });

  it("does not resurrect a value the seller removed from the declared list", () => {
    const options = resolveProductOptions([{ name: "Colour", values: ["Pink"] }], [
      { option_values: { colour: "Pink" } },
      { option_values: { colour: "Blue" } },
    ]);
    expect(options).toEqual([{ name: "Colour", values: ["Pink"] }]);
  });

  it("reports a product with neither as simple", () => {
    expect(isVariableProduct(resolveProductOptions("[]", [{ option_values: {} }]))).toBe(false);
  });
});

describe("variantOptionValues", () => {
  it("lowercases keys and drops blanks", () => {
    expect(variantOptionValues({ option_values: { Color: " Pink ", Size: "", Material: null } })).toEqual({
      color: "Pink",
    });
  });

  it("returns an empty selection for arrays, strings and nulls", () => {
    expect(variantOptionValues({ option_values: ["Pink"] })).toEqual({});
    expect(variantOptionValues({ option_values: null })).toEqual({});
    expect(variantOptionValues(null)).toEqual({});
  });
});

describe("selectionTitle", () => {
  it("orders by the declared options, not by the key order of the selection", () => {
    // `{size, color}` is exactly what a jsonb read-back looks like: Postgres
    // sorts object keys by (length, bytes), so `size` arrives first.
    const selection = { size: "3M", color: "Pink" };
    expect(
      selectionTitle(selection, [
        { name: "Color", values: ["Pink"] },
        { name: "Size", values: ["3M"] },
      ]),
    ).toBe("Pink / 3M");
  });

  it("lets the seller's declared order beat the colour-first default", () => {
    expect(
      selectionTitle({ size: "3M", color: "Pink" }, [
        { name: "Size", values: ["3M"] },
        { name: "Color", values: ["Pink"] },
      ]),
    ).toBe("3M / Pink");
  });

  it("ranks values with no declared option colour-first rather than by key", () => {
    expect(selectionTitle({ size: "3M", color: "Pink" })).toBe("Pink / 3M");
    expect(selectionTitle({ size: "3M", material: "Cotton", colour: "Pink" })).toBe("Pink / 3M / Cotton");
  });

  it("takes casing from the declared values so a retyped choice reads the same", () => {
    expect(selectionTitle({ color: "pink" }, [{ name: "Color", values: ["Pink"] }])).toBe("Pink");
  });

  it("orders a hand-built selection whose keys were never lowercased", () => {
    expect(
      selectionTitle({ Size: "3M", COLOUR: "pink" }, [
        { name: "Colour", values: ["Pink"] },
        { name: "Size", values: ["3M"] },
      ]),
    ).toBe("Pink / 3M");
  });

  it("names an optionless variant what the seed and the schema call it", () => {
    expect(selectionTitle({}, [])).toBe(defaultVariantTitle);
  });

  it("shows the dash the seller pasted, even though matching ignores it", () => {
    // Folding belongs in the comparison key, not on the page: a shopper reads
    // "3–6 Months", not "3-6 months".
    expect(selectionTitle({ size: "3–6 Months" })).toBe("3–6 Months");
    expect(parseProductOptions([{ name: "Size", values: ["3–6 Months"] }])[0].values).toEqual([
      "3–6 Months",
    ]);
  });
});

describe("selectionSignature", () => {
  it("is the same whichever order the keys come back in", () => {
    expect(selectionSignature({ size: "3M", color: "Pink" })).toBe(
      selectionSignature({ color: "Pink", size: "3M" }),
    );
  });

  it("ignores the differences a seller cannot see", () => {
    const stored = selectionSignature({ color: "Pink", size: "3–6 Months" });
    // Retyped by hand: lowercase, a plain hyphen, a stray double space.
    expect(selectionSignature({ Color: "pink", Size: "3-6  months" })).toBe(stored);
  });

  it("keeps differences that matter", () => {
    expect(selectionSignature({ color: "Pink" })).not.toBe(selectionSignature({ color: "Pinks" }));
    expect(selectionSignature({ color: "Pink" })).not.toBe(selectionSignature({ colour: "Pink" }));
    // A partial selection is not the same combination as a complete one.
    expect(selectionSignature({ color: "Pink" })).not.toBe(
      selectionSignature({ color: "Pink", size: "3M" }),
    );
  });

  it("cannot be forged by a value containing the separators", () => {
    expect(selectionSignature({ color: "a=b&size=3M" })).not.toBe(
      selectionSignature({ color: "a", size: "3M", b: "" }),
    );
  });

  it("drops blank values so a half-filled row does not become its own combination", () => {
    expect(selectionSignature({ color: "Pink", size: "  " })).toBe(selectionSignature({ color: "Pink" }));
    expect(selectionSignature({})).toBe("");
  });
});
