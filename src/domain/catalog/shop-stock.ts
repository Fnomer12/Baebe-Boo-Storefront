/**
 * Stock for a variable product: one `inventory_levels` row per (variant, shop).
 *
 * Two directions, both previously inline and neither tested.
 *
 * Going down: the create form collects "12 at Osu, 4 at Spintex" for the
 * PRODUCT, but inventory is per variant, so those numbers have to be expanded
 * across the grid. Going up: `product_shop_availability` is the legacy
 * per-product table the storefront still reads, so after any change the
 * siblings have to be summed back into it — the loop currently living in
 * src/lib/admin/catalog.ts, where it can only be exercised by hitting the API.
 */

export type ShopStockLevel = {
  shopId: string;
  onHand: number;
  reorderPoint?: number;
};

export type StockPlanVariant = {
  /** Whatever the caller uses to identify a variant before it has an id — usually its signature. */
  key: string;
  /** Per-variant stock. Any shop left out falls back to the product-level number. */
  stock?: readonly ShopStockLevel[];
};

export type StockPlanRow = {
  variantKey: string;
  shopId: string;
  onHand: number;
  reorderPoint: number;
};

export type ShopRollUp = {
  shopId: string;
  onHand: number;
  isAvailable: boolean;
};

function count(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

/**
 * The `inventory_levels` rows a saved product implies.
 *
 * The shop list comes from `availability` — the shops the product is stocked
 * in at all — and a per-variant entry only overrides the number, never adds a
 * shop. Stock typed against a shop the product is not sold in is rejected by
 * `productVariantsReplaceSchema` before it reaches here; silently creating the
 * row instead would put a variant on a shelf the seller never chose.
 *
 * Note what the product-level fallback means once a product has four variants:
 * "12 at Osu" becomes twelve of EACH, and `rollUpByShop` will then report 48.
 * That is the honest reading of a single number spread across a grid, and it
 * is why the editor asks for stock per variant as soon as options exist.
 */
export function expandStockPlan(
  variants: readonly StockPlanVariant[],
  availability: readonly ShopStockLevel[],
): StockPlanRow[] {
  const shops = new Map<string, ShopStockLevel>();
  for (const level of availability) {
    if (!level?.shopId) continue;
    shops.set(level.shopId, level);
  }

  const rows: StockPlanRow[] = [];
  for (const variant of variants) {
    const overrides = new Map<string, ShopStockLevel>();
    for (const level of variant.stock || []) {
      if (!level?.shopId) continue;
      overrides.set(level.shopId, level);
    }
    for (const [shopId, fallback] of shops) {
      const level = overrides.get(shopId) || fallback;
      rows.push({
        variantKey: variant.key,
        shopId,
        onHand: count(level.onHand),
        reorderPoint: count(level.reorderPoint ?? fallback.reorderPoint ?? 0),
      });
    }
  }
  return rows;
}

/**
 * Sum every variant's stock back into a per-shop total.
 *
 * `product_shop_availability` predates variants and is still what the
 * storefront's "in stock at" badge reads, so it has to be kept in step. It is
 * a SUM, not a copy of the row that just changed: setting the 6M to zero must
 * not report the whole product out of stock when there are nine 3M on the
 * shelf.
 */
export function rollUpByShop(
  levels: readonly ShopStockLevel[],
  options: { productIsActive?: boolean } = {},
): ShopRollUp[] {
  const totals = new Map<string, number>();
  for (const level of levels) {
    if (!level?.shopId) continue;
    totals.set(level.shopId, (totals.get(level.shopId) || 0) + count(level.onHand));
  }

  const productIsActive = options.productIsActive !== false;
  return [...totals.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([shopId, onHand]) => ({
      shopId,
      onHand,
      isAvailable: productIsActive && onHand > 0,
    }));
}
