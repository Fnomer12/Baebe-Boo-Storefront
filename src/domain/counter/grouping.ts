import type { CounterCatalogItem } from "./catalog";
import { availableStock } from "./stock";

/**
 * One product, with every version of it this shop stocks.
 */
export type CounterProductGroup = {
  productId: string;
  name: string;
  category: string;
  ageRange: string;
  gender: string;
  imageUrl: string;
  /** The product's own SKU stem, shown when there is nothing more specific. */
  sku: string;
  variants: CounterCatalogItem[];
  /** Sum of sellable stock across every version. */
  available: number;
  priceFrom: number;
  priceTo: number;
};

/**
 * Collapse a flat catalogue into one entry per product.
 *
 * The till used to render one card per `inventory_levels` row — that is, one
 * per *version*. At a shop carrying 20 products with four sizes each, the
 * cashier faced 58 cards, ten of which appeared four times over with the same
 * photo and the same name, separated only by a SKU suffix. Picking the right
 * one meant reading `-01` against `-04`.
 *
 * Grouping is not just tidier, it is faster. Finding "the hoodie" among four
 * identical cards and hoping you tapped the 6M is slower and more error-prone
 * than tapping "the hoodie" and being asked which size — and a multi-version
 * sale has to answer that question either way.
 *
 * Ordering is stable and by name, so the grid does not reshuffle under a
 * cashier's finger when stock changes after a sale.
 */
export function groupCatalogByProduct(
  items: readonly CounterCatalogItem[],
): CounterProductGroup[] {
  const groups = new Map<string, CounterProductGroup>();

  for (const item of items) {
    const existing = groups.get(item.productId);
    const available = availableStock(item);

    if (!existing) {
      groups.set(item.productId, {
        productId: item.productId,
        name: item.name,
        category: item.category,
        ageRange: item.ageRange,
        gender: item.gender,
        imageUrl: item.imageUrl,
        sku: item.sku,
        variants: [item],
        available,
        priceFrom: item.price,
        priceTo: item.price,
      });
      continue;
    }

    existing.variants.push(item);
    existing.available += available;
    existing.priceFrom = Math.min(existing.priceFrom, item.price);
    existing.priceTo = Math.max(existing.priceTo, item.price);
    // A product photo lives on the product, but a legacy row may carry none
    // while a sibling does. Take the first non-empty one.
    if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
  }

  const ordered = Array.from(groups.values());
  for (const group of ordered) {
    group.variants.sort(compareVariants);
  }
  ordered.sort((first, second) => first.name.localeCompare(second.name));
  return ordered;
}

/**
 * Versions read in a predictable order: the ones a cashier can actually sell
 * first, then by label.
 *
 * Sorting sold-out versions to the bottom matters more than alphabetical
 * purity — the picker's job is to get to a sellable option in one glance.
 */
function compareVariants(first: CounterCatalogItem, second: CounterCatalogItem) {
  const firstSellable = availableStock(first) > 0 ? 0 : 1;
  const secondSellable = availableStock(second) > 0 ? 0 : 1;
  if (firstSellable !== secondSellable) return firstSellable - secondSellable;

  const firstLabel = first.variantTitle || first.sku;
  const secondLabel = second.variantTitle || second.sku;
  return firstLabel.localeCompare(secondLabel, undefined, { numeric: true });
}

/**
 * Whether this group needs a picker at all.
 *
 * A single-version product must stay a one-tap add. Making every product cost
 * two taps to protect the minority that need a choice would be a downgrade at
 * a busy till.
 */
export function needsVariantPicker(group: CounterProductGroup): boolean {
  return group.variants.length > 1;
}

/**
 * The version to add when there is no choice to make.
 *
 * Returns null when the only version is unsellable — a legacy row with no
 * variant id, or one with nothing on the shelf.
 */
export function soleSellableVariant(
  group: CounterProductGroup,
): CounterCatalogItem | null {
  if (group.variants.length !== 1) return null;
  const only = group.variants[0];
  if (!only.variantId || availableStock(only) <= 0) return null;
  return only;
}

/**
 * The order option values read in, most distinguishing first.
 *
 * This list is not decoration. `option_values` is jsonb, and Postgres stores
 * object keys sorted by (length, bytes) — so `{"color":"Blue","size":"3M"}`
 * comes back with `size` FIRST, and a naive `Object.values()` renders
 * "3M · Blue". Shoppers and cashiers say "the blue 3M", so the label has to
 * impose its own order rather than inherit the database's.
 */
const OPTION_ORDER = ["color", "colour", "size", "material"];

function optionRank(key: string) {
  const index = OPTION_ORDER.indexOf(key.toLowerCase());
  return index === -1 ? OPTION_ORDER.length : index;
}

/**
 * A short human label for one version, for a card, a cart line or a receipt.
 *
 * Prefers the stored option values over the free-text title, because the
 * title is authored and the option values are structured — "Blue · 3M" beats
 * whatever somebody typed. Falls back to the title, then to the SKU, so this
 * never returns an empty string and no version is ever unlabelled.
 */
export function variantLabel(item: CounterCatalogItem): string {
  const entries = Object.entries(item.optionValues || {})
    .map(([key, value]) => [key, String(value).trim()] as const)
    .filter(([, value]) => value.length > 0)
    .sort(([first], [second]) => {
      const rank = optionRank(first) - optionRank(second);
      return rank !== 0 ? rank : first.localeCompare(second);
    });

  if (entries.length > 0) return entries.map(([, value]) => value).join(" · ");
  if (item.variantTitle) return item.variantTitle;
  return item.sku;
}
