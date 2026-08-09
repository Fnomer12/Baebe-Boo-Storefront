import { describe, expect, it } from "vitest";
import { applyOptionChoice } from "./option-picker";
import type { ProductOption } from "./product-options";
import type { SelectableVariant } from "./variant-selection";

const options: ProductOption[] = [
  { name: "Colour", values: ["Pink", "Blue"] },
  { name: "Size", values: ["3M", "6M"] },
];

const variants: SelectableVariant[] = [
  { id: "pink-3m", optionValues: { colour: "Pink", size: "3M" }, price: 100 },
  { id: "pink-6m", optionValues: { colour: "Pink", size: "6M" }, price: 100 },
  { id: "blue-6m", optionValues: { colour: "Blue", size: "6M" }, price: 120 },
];

describe("applyOptionChoice", () => {
  it("moves a later option along when the new colour does not come in that size", () => {
    // The bug: switching to Blue left "3M" selected AND struck through, so Add
    // to bag refused a combination the page was showing as chosen.
    const next = applyOptionChoice(options, variants, { colour: "Pink", size: "3M" }, "Colour", "Blue");
    expect(next).toEqual({ colour: "Blue", size: "6M" });
  });

  it("leaves a later option alone when it survives the change", () => {
    const next = applyOptionChoice(options, variants, { colour: "Blue", size: "6M" }, "Colour", "Pink");
    expect(next).toEqual({ colour: "Pink", size: "6M" });
  });

  it("never rewrites the options that come before the one tapped", () => {
    // Size does not constrain Colour, so picking a size must not swap the
    // colour out from under the shopper.
    const next = applyOptionChoice(options, variants, { colour: "Pink", size: "6M" }, "Size", "3M");
    expect(next).toEqual({ colour: "Pink", size: "3M" });
  });

  it("keeps the other choices on a product that has no variant rows", () => {
    // The bug: demo and pre-migration products carry options but no variants,
    // so every value reads as unavailable — and picking a colour reset the size
    // back to the first one declared.
    const next = applyOptionChoice(options, [], { colour: "Pink", size: "6M" }, "Colour", "Blue");
    expect(next).toEqual({ colour: "Blue", size: "6M" });
  });

  it("seeds a later option that was never chosen with the first buyable value", () => {
    const next = applyOptionChoice(options, variants, { colour: "Pink" }, "Colour", "Blue");
    expect(next).toEqual({ colour: "Blue", size: "6M" });
  });

  it("matches the tapped option by name however it was cased or spaced", () => {
    const next = applyOptionChoice(options, variants, { colour: "Pink", size: "3M" }, " colour ", "Blue");
    expect(next).toEqual({ colour: "Blue", size: "6M" });
  });

  it("handles a third option without special-casing it", () => {
    const three: ProductOption[] = [...options, { name: "Material", values: ["Cotton", "Linen"] }];
    const rows: SelectableVariant[] = [
      { id: "a", optionValues: { colour: "Pink", size: "3M", material: "Cotton" }, price: 100 },
      { id: "b", optionValues: { colour: "Blue", size: "6M", material: "Linen" }, price: 100 },
    ];
    const next = applyOptionChoice(three, rows, { colour: "Pink", size: "3M", material: "Cotton" }, "Colour", "Blue");
    expect(next).toEqual({ colour: "Blue", size: "6M", material: "Linen" });
  });
});
