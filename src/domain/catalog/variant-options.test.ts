import { describe, expect, it } from "vitest";
import { deriveVariantOptions } from "./variant-options";

const pajamas = "Baby Girl Strawberry 100% Cotton 2-Way Zip Sleep & Play Pajamas - Pink";

function row(overrides: Partial<Parameters<typeof deriveVariantOptions>[0][number]> = {}) {
  return { id: "v1", title: "Default Title", option_values: null, price: 120, ...overrides };
}

/** The option values a page would actually render, keyed by option name. */
function chips(result: ReturnType<typeof deriveVariantOptions>) {
  return Object.fromEntries(result.options.map((option) => [option.name, option.values]));
}

describe("deriveVariantOptions", () => {
  it("reads structured colour and size options", () => {
    const result = deriveVariantOptions(
      [
        row({ id: "a", title: "Pink / 3M", option_values: { color: "Pink", size: "3M" } }),
        row({ id: "b", title: "Pink / 6M", option_values: { Color: "Pink", Size: "6M" } }),
      ],
      pajamas,
    );

    expect(chips(result)).toEqual({ Color: ["Pink"], Size: ["3M", "6M"] });
    expect(result.variants[1]).toMatchObject({ id: "b", color: "Pink", size: "6M", price: 120 });
  });

  it("puts colour before size however jsonb hands the keys back", () => {
    // Postgres sorts jsonb keys by (length, bytes), so `size` arrives first.
    const result = deriveVariantOptions(
      [row({ option_values: { size: "3M", color: "Pink" } })],
      pajamas,
    );
    expect(result.options.map((option) => option.name)).toEqual(["Color", "Size"]);
  });

  it("accepts British spelling of colour", () => {
    const result = deriveVariantOptions([row({ option_values: { colour: "Navy Blue" } })], pajamas);
    expect(chips(result)).toEqual({ Colour: ["Navy Blue"] });
    expect(result.variants[0].color).toBe("Navy Blue");
  });

  it("never turns a product name into a size chip", () => {
    const result = deriveVariantOptions([row({ title: pajamas })], pajamas);

    expect(result.options).toEqual([]);
    // The variant stays selectable so the cart can still match it.
    expect(result.variants).toEqual([
      { id: "v1", title: pajamas, optionValues: {}, color: undefined, size: undefined, price: 120 },
    ]);
  });

  it("drops titles too long to fit a chip", () => {
    // A legacy row with no structured options and a sentence for a title: the
    // sentence is a description, not a size.
    const result = deriveVariantOptions(
      [row({ title: "Fits newborns up to nine kilograms" })],
      pajamas,
    );
    expect(result.options).toEqual([]);
  });

  it("keeps a structured option value that is longer than a chip", () => {
    // Regression: the 28-character title cap was being applied to structured
    // `option_values` too, so "White with Pink Elephant Print" (29) was stripped,
    // the variant was left with `optionValues: {}` — matching nothing — and the
    // shopper could never buy it. The cap guards titles, not declared values.
    const colour = "White with Pink Elephant Print";
    const result = deriveVariantOptions(
      [row({ option_values: { colour, size: "3M" } })],
      pajamas,
    );

    expect(chips(result)).toEqual({ Colour: [colour], Size: ["3M"] });
    expect(result.variants[0].optionValues).toEqual({ colour, size: "3M" });
    expect(result.variants[0].color).toBe(colour);
  });

  it("falls back to short variant titles when no structured options exist", () => {
    const result = deriveVariantOptions(
      [row({ id: "a", title: "Newborn" }), row({ id: "b", title: "3–6M" })],
      "Cloud-Soft Organic Romper",
    );
    expect(chips(result)).toEqual({ Size: ["Newborn", "3–6M"] });
  });

  it("ignores the placeholder title the schema writes for optionless products", () => {
    const result = deriveVariantOptions([row()], pajamas);
    expect(result.options).toEqual([]);
    expect(result.variants[0].size).toBeUndefined();
  });

  it("does not treat a combined title as a size once a colour is known", () => {
    const result = deriveVariantOptions(
      [row({ title: "Pink / 3M", option_values: { color: "Pink" } })],
      pajamas,
    );
    expect(chips(result)).toEqual({ Color: ["Pink"] });
  });

  it("deduplicates repeated labels and trims whitespace", () => {
    const result = deriveVariantOptions(
      [
        row({ id: "a", option_values: { color: " Pink ", size: "3M" } }),
        row({ id: "b", option_values: { color: "Pink", size: "3M" } }),
      ],
      pajamas,
    );
    expect(chips(result)).toEqual({ Color: ["Pink"], Size: ["3M"] });
  });

  it("shows a declared value the shop has not built a variant for yet", () => {
    // A seller who lists Colour: Pink, Blue must see Blue on the page before
    // the Blue rows exist — otherwise the option editor looks broken.
    const result = deriveVariantOptions(
      [row({ option_values: { colour: "Pink" } })],
      pajamas,
      [{ name: "Colour", values: ["Pink", "Blue"] }],
    );
    expect(chips(result)).toEqual({ Colour: ["Pink", "Blue"] });
  });

  it("falls back to the variants when the declared options are unreadable", () => {
    const result = deriveVariantOptions(
      [row({ option_values: { colour: "Pink" } })],
      pajamas,
      "not json",
    );
    expect(chips(result)).toEqual({ Colour: ["Pink"] });
  });

  it("keeps every cleaned value on the variant, not just colour and size", () => {
    const result = deriveVariantOptions(
      [row({ option_values: { colour: "Pink", material: "Cotton" } })],
      pajamas,
    );
    expect(result.variants[0].optionValues).toEqual({ colour: "Pink", material: "Cotton" });
    expect(chips(result)).toEqual({ Colour: ["Pink"], Material: ["Cotton"] });
  });
});
