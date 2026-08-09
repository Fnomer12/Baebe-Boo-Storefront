import { describe, expect, it } from "vitest";
import {
  cartLineOptionSummary,
  cartLineOptionValues,
  cartLineSignature,
  legacyCartLineFields,
} from "./cart-line-options";

describe("cart line options", () => {
  it("reads a line saved before variable products shipped", () => {
    // Carts sit in the shopper's localStorage for weeks. A line written by the
    // old colour/size storefront must still say what it is, not go blank.
    expect(cartLineOptionValues({ color: "Cream", size: "0–3M" })).toEqual({
      color: "Cream",
      size: "0–3M",
    });
    expect(cartLineOptionSummary({ color: "Cream", size: "0–3M" })).toBe("Cream / 0–3M");
  });

  it("reads a line with three options, which the legacy shape could not hold", () => {
    const line = { optionValues: { colour: "Navy", size: "3M", material: "Cotton" } };
    expect(cartLineOptionSummary(line)).toBe("Navy / 3M / Cotton");
  });

  it("prefers stored option values over stale legacy mirrors on the same line", () => {
    const line = { optionValues: { colour: "Sky" }, color: "Cream", size: "0–3M" };
    expect(cartLineOptionValues(line)).toEqual({ colour: "Sky" });
  });

  it("says nothing for a product that has no versions", () => {
    expect(cartLineOptionSummary({ id: "p1" })).toBe("");
    expect(cartLineOptionValues({ id: "p1", color: "", size: undefined })).toEqual({});
  });

  it("merges a legacy line with a new one describing the same choice", () => {
    // The bug: adding the same romper again after the release appended a second
    // line instead of bumping the quantity, because the two shapes disagreed.
    const legacy = { id: "p1", variantId: "v1", color: "Cream", size: "0–3M" };
    const current = { id: "p1", variantId: "v1", optionValues: { color: "Cream", size: "0–3M" } };
    expect(cartLineSignature(current)).toBe(cartLineSignature(legacy));
  });

  it("keeps different versions, branches and products apart", () => {
    const base = { id: "p1", variantId: "v1", optionValues: { color: "Cream", size: "0–3M" } };
    expect(cartLineSignature({ ...base, optionValues: { color: "Sky", size: "0–3M" } })).not.toBe(
      cartLineSignature(base),
    );
    expect(cartLineSignature({ ...base, shopId: "accra" })).not.toBe(cartLineSignature(base));
    expect(cartLineSignature({ ...base, id: "p2" })).not.toBe(cartLineSignature(base));
  });

  it("treats a shop given as an object the same as a shop given as an id", () => {
    const byId = { id: "p1", shopId: "accra", optionValues: { size: "3M" } };
    const byObject = { id: "p1", shop: { id: "accra" }, optionValues: { size: "3M" } };
    expect(cartLineSignature(byObject)).toBe(cartLineSignature(byId));
  });

  it("mirrors only the two attributes the legacy shape ever had", () => {
    expect(legacyCartLineFields({ colour: "Navy", size: "3M", material: "Cotton" })).toEqual({
      color: "Navy",
      size: "3M",
    });
    expect(legacyCartLineFields({ material: "Cotton" })).toEqual({});
  });
});
