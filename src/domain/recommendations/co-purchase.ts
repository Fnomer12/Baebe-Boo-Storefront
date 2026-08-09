export interface OrderItemRow {
  orderId: string;
  productId: string;
}

/**
 * Computes "frequently bought together" product IDs from order-item rows.
 *
 * A product qualifies when it appears in an order that also contains the
 * current product. Products are ranked by the number of distinct orders they
 * co-occur in (repeat line items within one order count once). Ties keep
 * first-seen order so results are deterministic. The current product is
 * always excluded. Pure and framework-free; rows must be pre-filtered to
 * eligible (e.g. paid) orders by the caller.
 */
export function frequentlyBoughtTogether(
  productId: string,
  rows: readonly OrderItemRow[],
  limit = 4,
): string[] {
  const orderIds = new Set<string>();
  for (const row of rows) {
    if (row.productId === productId) orderIds.add(row.orderId);
  }
  if (!orderIds.size) return [];

  const counts = new Map<string, number>();
  const seenInOrder = new Set<string>();
  for (const row of rows) {
    if (row.productId === productId || !orderIds.has(row.orderId)) continue;
    const pair = `${row.orderId}::${row.productId}`;
    if (seenInOrder.has(pair)) continue;
    seenInOrder.add(pair);
    counts.set(row.productId, (counts.get(row.productId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count], firstSeen) => ({ id, count, firstSeen }))
    .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
    .slice(0, Math.max(limit, 0))
    .map(({ id }) => id);
}
