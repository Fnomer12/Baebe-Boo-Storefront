/**
 * The shopper's side of a variable product: which chips are pickable, which
 * variant a set of chips means, and what the product costs before you choose.
 *
 * The rule for greying out a chip is Shopify's, and it is not symmetric on
 * purpose. A value on option i is offered when some live variant carries it
 * AND agrees with the choices already made on options 0..i-1 — earlier options
 * only. If every option constrained every other one, a shopper who picked
 * Pink/3M could not switch to Blue without first un-picking 3M, which reads as
 * a broken page. Constraining forwards means the last option they touched
 * always stays free to change.
 */

import {
  optionKey,
  optionValueKey,
  selectionSignature,
  variantIsActive,
  variantOptionValues,
  type OptionSelection,
  type ProductOption,
  type VariantOptionSource,
} from "./product-options";

export type SelectableVariant = VariantOptionSource & {
  id: string;
  price?: number | string | null;
  isDefault?: boolean;
  is_default?: boolean;
};

export type OptionValueAvailability = {
  value: string;
  /** False when no live variant offers this value alongside the earlier choices. */
  available: boolean;
  selected: boolean;
};

export type OptionAvailability = {
  name: string;
  key: string;
  values: OptionValueAvailability[];
};

export type PriceRange = { from: number; to: number };

function isDefaultVariant(variant: SelectableVariant): boolean {
  return Boolean(variant.isDefault ?? variant.is_default);
}

/** Restricted to the declared options, so a stray legacy key cannot break a match. */
function declaredValues(
  variant: SelectableVariant,
  options: readonly ProductOption[],
): OptionSelection {
  const values = variantOptionValues(variant);
  if (options.length === 0) return values;
  const selection: OptionSelection = {};
  for (const option of options) {
    const key = optionKey(option.name);
    if (values[key]) selection[key] = values[key];
  }
  return selection;
}

function matchesUpTo(
  variantValues: OptionSelection,
  selection: OptionSelection,
  keys: readonly string[],
): boolean {
  return keys.every((key) => {
    const chosen = selection[key];
    if (!chosen) return true;
    return optionValueKey(variantValues[key]) === optionValueKey(chosen);
  });
}

/**
 * Which chips can be picked, given what has been picked already.
 *
 * Stock is deliberately not consulted: it lives in `inventory_levels`, is
 * per-shop, and the product page does not know which shop the shopper will
 * collect from. `is_active` is the catalogue-wide answer to "do we sell this".
 */
export function optionAvailability(
  options: readonly ProductOption[],
  variants: readonly SelectableVariant[],
  selection: OptionSelection = {},
): OptionAvailability[] {
  const live = variants.filter((variant) => variantIsActive(variant));
  const keys = options.map((option) => optionKey(option.name));

  return options.map((option, index) => {
    const key = keys[index];
    const earlier = keys.slice(0, index);
    const chosen = optionValueKey(selection[key]);

    return {
      name: option.name,
      key,
      values: option.values.map((value) => ({
        value,
        available: live.some((variant) => {
          const values = declaredValues(variant, options);
          if (optionValueKey(values[key]) !== optionValueKey(value)) return false;
          return matchesUpTo(values, selection, earlier);
        }),
        selected: chosen.length > 0 && optionValueKey(value) === chosen,
      })),
    };
  });
}

/**
 * What the page opens on.
 *
 * The product's default variant leads, because that is the row whose price and
 * photo the listing card already showed and a shopper should not watch the
 * price change on arrival. When that variant is gone or switched off, each
 * option falls back to its first still-buyable value rather than its first
 * declared one — landing on a sold-out combination makes a live product look
 * dead.
 */
export function defaultSelection(
  options: readonly ProductOption[],
  variants: readonly SelectableVariant[],
): OptionSelection {
  const live = variants.filter((variant) => variantIsActive(variant));
  const preferred = live.find((variant) => isDefaultVariant(variant)) || live[0];
  const seed = preferred ? declaredValues(preferred, options) : {};

  const selection: OptionSelection = {};
  for (const option of options) {
    const key = optionKey(option.name);
    const availability = optionAvailability(options, variants, selection).find(
      (entry) => entry.key === key,
    );
    const candidates = availability?.values || [];
    const seeded = candidates.find(
      (entry) => optionValueKey(entry.value) === optionValueKey(seed[key]) && entry.available,
    );
    const firstAvailable = candidates.find((entry) => entry.available);
    const chosen = seeded || firstAvailable || candidates[0];
    if (chosen) selection[key] = chosen.value;
  }
  return selection;
}

/**
 * The variant a full selection names, or null.
 *
 * Matched on the option signature rather than by walking keys, so a selection
 * read back out of jsonb — where the keys came back sorted by length — still
 * finds its row, and so "3-6 Months" finds the variant stored as "3–6 Months".
 */
export function findVariantForSelection<Variant extends SelectableVariant>(
  variants: readonly Variant[],
  selection: OptionSelection,
  options: readonly ProductOption[] = [],
): Variant | null {
  const wanted = selectionSignature(selection);
  const matches = variants.filter(
    (variant) => selectionSignature(declaredValues(variant, options)) === wanted,
  );
  if (matches.length === 0) return null;
  return (
    matches.find((variant) => variantIsActive(variant) && isDefaultVariant(variant)) ||
    matches.find((variant) => variantIsActive(variant)) ||
    matches[0]
  );
}

/**
 * The price span across the versions on sale, for a listing card.
 *
 * Live variants only — a discontinued GH₵29 version must not keep advertising
 * "From GH₵29.00". If nothing is live, every variant counts, because a price
 * of zero on a product page is worse than a stale one.
 */
export function priceRange(variants: readonly SelectableVariant[]): PriceRange {
  const pricesOf = (rows: readonly SelectableVariant[]) =>
    rows
      .map((variant) => Number(variant.price))
      .filter((price) => Number.isFinite(price) && price > 0);

  const live = pricesOf(variants.filter((variant) => variantIsActive(variant)));
  const prices = live.length > 0 ? live : pricesOf(variants);
  if (prices.length === 0) return { from: 0, to: 0 };
  return { from: Math.min(...prices), to: Math.max(...prices) };
}
