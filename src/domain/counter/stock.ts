import type { CounterCatalogItem } from "./catalog";

export type StockStatus = "out" | "low" | "healthy";

export const LOW_STOCK_THRESHOLD = 3;

/**
 * Sellable units: what is on the shelf minus what is already promised to an
 * online order. Floors at zero so an over-reserved row never renders as a
 * negative count.
 */
export function availableStock(item: Pick<CounterCatalogItem, "onHand" | "reserved">) {
  return Math.max(0, item.onHand - item.reserved);
}

export function stockStatus(available: number): StockStatus {
  if (available <= 0) return "out";
  if (available <= LOW_STOCK_THRESHOLD) return "low";
  return "healthy";
}

/**
 * Apply the quantities just sold to a catalogue held in component state, so
 * the grid reflects the sale without a refetch.
 *
 * Keyed by **variant** id. The previous implementation keyed by product id
 * while the sale itself was by variant, so selling one colour of a product
 * decremented every colour.
 */
export function applySoldQuantities(
  items: readonly CounterCatalogItem[],
  soldByVariantId: ReadonlyMap<string, number>,
): CounterCatalogItem[] {
  if (soldByVariantId.size === 0) return [...items];
  return items.map((item) => {
    const sold = item.variantId ? soldByVariantId.get(item.variantId) : undefined;
    if (!sold) return item;
    return { ...item, onHand: Math.max(0, item.onHand - sold) };
  });
}
