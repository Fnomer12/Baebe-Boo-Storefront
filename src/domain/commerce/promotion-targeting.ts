/**
 * Which products a promotion applies to, as rows for `promotion_products`.
 *
 * The table has existed since the first commerce migration and checkout has
 * always read it — an included list means "only these products", an excluded
 * list means "anything but these" — but nothing in the admin ever wrote a
 * single row, so every promotion silently applied to the whole catalogue.
 *
 * The primary key is (promotion_id, product_id), so a product named twice, or
 * named on both lists, would fail the insert. Deduping is therefore part of
 * the rule rather than a defensive extra.
 */
export type PromotionProductRow = {
  promotion_id: string;
  product_id: string;
  is_excluded: boolean;
};

export function promotionProductRows(
  promotionId: string,
  targeting: {
    productIds?: readonly string[];
    excludedProductIds?: readonly string[];
  },
): PromotionProductRow[] {
  const excluded = [...new Set(targeting.excludedProductIds ?? [])];
  const excludedSet = new Set(excluded);
  // Exclusion wins. If a product somehow reaches here on both lists, treating
  // it as excluded is the answer that cannot overcharge a customer.
  const included = [...new Set(targeting.productIds ?? [])].filter(
    (productId) => !excludedSet.has(productId),
  );

  return [
    ...included.map((productId) => ({
      promotion_id: promotionId,
      product_id: productId,
      is_excluded: false,
    })),
    ...excluded.map((productId) => ({
      promotion_id: promotionId,
      product_id: productId,
      is_excluded: true,
    })),
  ];
}
