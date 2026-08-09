/**
 * Turns raw `product_variants` rows into options a product page can render.
 *
 * The store has two generations of variant data. Newer rows carry structured
 * `option_values` ({ color: "Pink", size: "3M" }); older ones carry nothing but
 * a `title`, which sellers commonly fill with the entire product name. Treating
 * that title as an option produced chips like "Baby Girl Strawberry 100% Cotton
 * 2-Way Zip Sleep & Play Pajamas - Pink" — so unusable labels are dropped here,
 * once, for both the option lists and the variant records the cart matches
 * against, keeping the two in agreement.
 *
 * This used to return `{ colors, sizes }`, which hardcoded the belief that a
 * product has exactly two attributes and that they are those two. It now
 * returns the generic `ProductOption[]` every other module speaks, and takes
 * the product's DECLARED options when it has them — a seller who lists
 * Colour: Pink, Blue must see Blue on the page even before a Blue variant is
 * saved. `color` and `size` survive on each variant as conveniences for the
 * callers that still match a cart line on them.
 */

import {
  resolveProductOptions,
  type OptionSelection,
  type ProductOption,
} from "./product-options";

export type RawVariantRow = {
  id: string;
  title: string;
  option_values: unknown;
  price: number | string;
};

export type CatalogVariant = {
  id: string;
  title: string;
  /** Cleaned option values keyed by lowercase option name — the cart's match key. */
  optionValues: OptionSelection;
  color?: string;
  size?: string;
  price: number;
};

export type VariantOptions = {
  options: ProductOption[];
  variants: CatalogVariant[];
};

/**
 * Longest *title* we will accept as a stand-in for an option. Legacy rows put
 * the entire product name in `title`, and a 70-character name must never become
 * a size chip; a real one-off title is short ("3M", "One size", "Navy Blue").
 *
 * This deliberately does NOT apply to structured `option_values`. Those are what
 * the seller declared the product is offered in, so "White with Pink Elephant
 * Print" (29 characters) is a legitimate colour. Capping it dropped the value,
 * left that variant with empty `optionValues`, and made it impossible to match
 * or buy — a long chip is a layout problem, an unbuyable variant is a lost sale.
 */
export const maxOptionLabelLength = 28;

const colorKeys = ["color", "colour"];

/** Returns a trimmed label, or undefined when the value cannot serve as an option. */
export function optionLabel(value: unknown, productName: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const label = value.trim();
  if (!label || label === "Default Title") return undefined;
  if (label.toLowerCase() === productName.trim().toLowerCase()) return undefined;
  return label;
}

/**
 * The same, for a legacy `title` being read as an option value. Anything past
 * chip length is a product name in disguise, so it is dropped rather than
 * rendered.
 */
export function titleOptionLabel(title: unknown, productName: string): string | undefined {
  const label = optionLabel(title, productName);
  return label && label.length <= maxOptionLabelLength ? label : undefined;
}

function lowercasedOptions(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.toLowerCase(), item]));
}

export function deriveVariantOptions(
  rows: RawVariantRow[],
  productName: string,
  declaredOptions?: unknown,
): VariantOptions {
  const variants = rows.map((row) => {
    const raw = lowercasedOptions(row.option_values);
    const optionValues: OptionSelection = {};
    for (const [key, value] of Object.entries(raw)) {
      const label = optionLabel(value, productName);
      if (label) optionValues[key] = label;
    }

    // A title only stands in for a size when the row carries no structured
    // options at all — otherwise "Pink / 3M" would become a size of its own.
    if (Object.keys(optionValues).length === 0) {
      const fromTitle = titleOptionLabel(row.title, productName);
      if (fromTitle) optionValues.size = fromTitle;
    }

    const color = colorKeys.map((key) => optionValues[key]).find((value) => value !== undefined);
    return {
      id: row.id,
      title: row.title,
      optionValues,
      color,
      size: optionValues.size,
      price: Number(row.price),
    };
  });

  return {
    // Declared options win; the cleaned variants above are the fallback, which
    // is what keeps every pre-migration product rendering.
    options: resolveProductOptions(declaredOptions, variants.map((variant) => ({
      optionValues: variant.optionValues,
    }))),
    variants,
  };
}
