import type { CounterCartLine, CounterCatalogItem } from "./catalog";
import { availableStock } from "./stock";
import { variantLabel } from "./grouping";

/**
 * Add one unit of a catalogue item to the cart, or bump an existing line.
 *
 * A line that cannot be sold (no variant id, nothing available) is rejected
 * rather than silently dropped, so the caller can explain why.
 */
export function addCartLine(
  lines: readonly CounterCartLine[],
  item: CounterCatalogItem,
): CounterCartLine[] {
  const available = availableStock(item);
  if (!item.variantId || available <= 0) return [...lines];

  const existing = lines.find((line) => line.variantId === item.variantId);
  if (existing) {
    return setCartQuantity(lines, item.variantId, existing.quantity + 1);
  }

  return [
    ...lines,
    {
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      imageUrl: item.imageUrl,
      price: item.price,
      quantity: 1,
      available,
      // Without this the cart shows "Bear Hoodie ×2" twice over and the
      // cashier cannot tell the customer which sizes they are paying for.
      variantTitle: variantLabel(item),
    },
  ];
}

/**
 * Set an explicit quantity, clamped to `[0, available]`. Zero removes the
 * line — the till has no use for a zero-quantity row.
 */
export function setCartQuantity(
  lines: readonly CounterCartLine[],
  variantId: string,
  quantity: number,
): CounterCartLine[] {
  const next: CounterCartLine[] = [];
  for (const line of lines) {
    if (line.variantId !== variantId) {
      next.push(line);
      continue;
    }
    const clamped = Math.min(Math.max(0, Math.floor(quantity)), line.available);
    if (clamped > 0) next.push({ ...line, quantity: clamped });
  }
  return next;
}

export function removeCartLine(
  lines: readonly CounterCartLine[],
  variantId: string,
): CounterCartLine[] {
  return lines.filter((line) => line.variantId !== variantId);
}

export function cartTotals(lines: readonly CounterCartLine[]) {
  let units = 0;
  let total = 0;
  for (const line of lines) {
    units += line.quantity;
    total += line.price * line.quantity;
  }
  // Money is summed in cedis and rounded once, not per line, so a cart of
  // fractional prices cannot drift away from what the RPC computes.
  return { lineCount: lines.length, units, total: Math.round(total * 100) / 100 };
}

/** The wire shape `complete_counter_sale` expects: variant id and quantity. */
export function toSaleItems(lines: readonly CounterCartLine[]) {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({ variantId: line.variantId, quantity: line.quantity }));
}

export function soldQuantitiesByVariant(
  lines: readonly CounterCartLine[],
): Map<string, number> {
  const sold = new Map<string, number>();
  for (const line of lines) {
    sold.set(line.variantId, (sold.get(line.variantId) || 0) + line.quantity);
  }
  return sold;
}
