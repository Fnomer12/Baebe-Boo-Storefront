import { describe, expect, it } from "vitest";
import {
  defaultSelection,
  findVariantForSelection,
  optionAvailability,
  priceRange,
  type SelectableVariant,
} from "./variant-selection";

const options = [
  { name: "Colour", values: ["Pink", "Blue"] },
  { name: "Size", values: ["3M", "6M"] },
];

function variant(
  colour: string,
  size: string,
  overrides: Partial<SelectableVariant> = {},
): SelectableVariant {
  return {
    id: `${colour}-${size}`.toLowerCase(),
    option_values: { colour, size },
    price: 120,
    is_active: true,
    ...overrides,
  };
}

// Pink comes in both sizes; Blue only in 6M.
const variants = [
  variant("Pink", "3M", { is_default: true }),
  variant("Pink", "6M", { price: 140 }),
  variant("Blue", "6M", { price: 160 }),
];

function valuesFor(name: string, selection: Record<string, string> = {}) {
  const entry = optionAvailability(options, variants, selection).find((option) => option.name === name);
  return Object.fromEntries((entry?.values || []).map((value) => [value.value, value.available]));
}

describe("optionAvailability", () => {
  it("offers every value of the first option regardless of what is picked later", () => {
    // Constraining backwards would trap a shopper on Pink: having chosen 3M
    // they could never switch to Blue without un-picking the size first.
    expect(valuesFor("Colour", { size: "3M" })).toEqual({ Pink: true, Blue: true });
  });

  it("greys out a size that colour does not come in", () => {
    expect(valuesFor("Size", { colour: "Blue" })).toEqual({ "3M": false, "6M": true });
    expect(valuesFor("Size", { colour: "Pink" })).toEqual({ "3M": true, "6M": true });
  });

  it("ignores a variant nobody can buy", () => {
    const withDiscontinued = [variant("Pink", "3M"), variant("Blue", "3M", { is_active: false })];
    const entry = optionAvailability(options, withDiscontinued, {}).find((option) => option.name === "Colour");
    expect(entry?.values).toEqual([
      { value: "Pink", available: true, selected: false },
      { value: "Blue", available: false, selected: false },
    ]);
  });

  it("marks the chosen chip whatever case it was typed in", () => {
    const entry = optionAvailability(options, variants, { colour: "pink" })[0];
    expect(entry.values.map((value) => value.selected)).toEqual([true, false]);
  });

  it("matches values across the dash a supplier sheet pastes in", () => {
    const sizes = [{ name: "Size", values: ["3–6 Months"] }];
    const rows = [{ id: "a", option_values: { size: "3-6 months" }, price: 90, is_active: true }];
    expect(optionAvailability(sizes, rows, {})[0].values[0].available).toBe(true);
  });
});

describe("defaultSelection", () => {
  it("opens on the default variant, so the price does not change on arrival", () => {
    expect(defaultSelection(options, variants)).toEqual({ colour: "Pink", size: "3M" });
  });

  it("falls back to a combination that can actually be bought", () => {
    // The default row is gone; Blue has no 3M, so the size must move too.
    const remaining = [variant("Blue", "6M")];
    expect(defaultSelection(options, remaining)).toEqual({ colour: "Blue", size: "6M" });
  });

  it("still returns a selection when nothing is on sale", () => {
    expect(defaultSelection(options, [])).toEqual({ colour: "Pink", size: "3M" });
  });
});

describe("findVariantForSelection", () => {
  it("finds the row a full selection names", () => {
    expect(findVariantForSelection(variants, { colour: "Blue", size: "6M" }, options)?.id).toBe("blue-6m");
  });

  it("finds it whatever order the keys arrived in and however it was cased", () => {
    expect(findVariantForSelection(variants, { size: "6m", Colour: " blue " }, options)?.id).toBe("blue-6m");
  });

  it("returns nothing for a half-made choice rather than guessing a variant", () => {
    expect(findVariantForSelection(variants, { colour: "Pink" }, options)).toBeNull();
  });

  it("returns nothing for a combination the shop does not stock", () => {
    expect(findVariantForSelection(variants, { colour: "Blue", size: "3M" }, options)).toBeNull();
  });

  it("ignores a legacy key the product no longer declares", () => {
    const legacy = [variant("Pink", "3M", { option_values: { colour: "Pink", size: "3M", material: "Cotton" } })];
    expect(findVariantForSelection(legacy, { colour: "Pink", size: "3M" }, options)?.id).toBe("pink-3m");
  });

  it("prefers a live row over a discontinued twin", () => {
    const rows = [
      variant("Pink", "3M", { id: "dead", is_active: false }),
      variant("Pink", "3M", { id: "live" }),
    ];
    expect(findVariantForSelection(rows, { colour: "Pink", size: "3M" }, options)?.id).toBe("live");
  });
});

describe("priceRange", () => {
  it("spans the versions on sale", () => {
    expect(priceRange(variants)).toEqual({ from: 120, to: 160 });
  });

  it("does not keep advertising a discontinued price", () => {
    const rows = [variant("Pink", "3M", { price: 29, is_active: false }), variant("Blue", "6M", { price: 160 })];
    expect(priceRange(rows)).toEqual({ from: 160, to: 160 });
  });

  it("reads prices that came back from Postgres as strings", () => {
    expect(priceRange([variant("Pink", "3M", { price: "120.50" })])).toEqual({ from: 120.5, to: 120.5 });
  });

  it("falls back to every row rather than showing a product for nothing", () => {
    expect(priceRange([variant("Pink", "3M", { price: 99, is_active: false })])).toEqual({ from: 99, to: 99 });
    expect(priceRange([])).toEqual({ from: 0, to: 0 });
  });
});
