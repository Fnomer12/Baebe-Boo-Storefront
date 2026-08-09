/**
 * How a cart line remembers which version of a product it is.
 *
 * Carts live in the shopper's own localStorage, which is data we do not
 * control and cannot migrate. Lines written before variable products existed
 * carry two flat fields, `color` and `size`; lines written from now on carry
 * `optionValues`, an object keyed by option name, because a product may have
 * three attributes and none of them need be a colour.
 *
 * So every reader here accepts both shapes and answers in the new one. That is
 * a deliberate one-release shim: drop the legacy branch once carts saved before
 * the release have expired, not before, or a parent who left a romper in their
 * bag last week loses the size they picked.
 */

import {
  selectionSignature,
  selectionTitle,
  variantOptionValues,
  type OptionSelection,
} from "./product-options";

/**
 * Anything cart-shaped: the stored line, or the arguments used to build one.
 * Deliberately loose — three different pages declare their own cart row type.
 */
export type CartLineOptionSource = {
  id?: string;
  variantId?: string;
  optionValues?: unknown;
  /** @deprecated Written before variable products; read for one release only. */
  color?: unknown;
  /** @deprecated Written before variable products; read for one release only. */
  size?: unknown;
  shopId?: string;
  shop?: { id?: string } | null;
};

/**
 * The chosen options of a line, whichever generation wrote it.
 *
 * `optionValues` wins when it carries anything at all; the legacy pair is only
 * consulted for lines that have none, so a new line never has its own values
 * shadowed by stale mirrors sitting alongside them.
 */
export function cartLineOptionValues(line: CartLineOptionSource): OptionSelection {
  const stored = variantOptionValues({ optionValues: line.optionValues });
  if (Object.keys(stored).length > 0) return stored;
  return variantOptionValues({ optionValues: { color: line.color, size: line.size } });
}

/**
 * The legacy fields to mirror onto a newly written line.
 *
 * Only colour and size, because those are the only two the old shape ever had
 * — a "Material" option has no legacy home and must not invent one. Kept so
 * that pages still keying or rendering on `item.color` keep working across the
 * release rather than collapsing every version of a product into one row.
 */
export function legacyCartLineFields(values: OptionSelection): { color?: string; size?: string } {
  const color = values.color || values.colour;
  return { ...(color ? { color } : {}), ...(values.size ? { size: values.size } : {}) };
}

/** "Pink / 3M", or "" when the line is a plain product with nothing to show. */
export function cartLineOptionSummary(line: CartLineOptionSource): string {
  const values = cartLineOptionValues(line);
  return Object.keys(values).length === 0 ? "" : selectionTitle(values);
}

/**
 * The identity of a cart line: same product, same version, same branch.
 *
 * Used both to merge a repeat "add to bag" into the existing line and as the
 * React key on the cart and checkout pages. Built on `selectionSignature`, so a
 * legacy line and a new line describing the same choice collapse together
 * instead of appearing twice with the quantity split between them.
 */
export function cartLineSignature(line: CartLineOptionSource): string {
  const shopId = line.shopId || line.shop?.id || "national";
  return [
    line.id || "",
    line.variantId || "",
    selectionSignature(cartLineOptionValues(line)),
    shopId,
  ].join("|");
}
