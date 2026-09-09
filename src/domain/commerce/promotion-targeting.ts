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
export type PromotionCategoryRow = {
  promotion_id: string;
  category: string;
  is_excluded: boolean;
};

const normalizeCategory = (category: string) => category.trim();

export function promotionCategoryRows(
  promotionId: string,
  targeting: {
    categories?: readonly string[];
    excludedCategories?: readonly string[];
  },
): PromotionCategoryRow[] {
  const excluded = [...new Set((targeting.excludedCategories ?? []).map(normalizeCategory).filter(Boolean))];
  const excludedSet = new Set(excluded.map((entry) => entry.toLowerCase()));
  // Exclusion wins, same rule as products: cannot overcharge a customer.
  const included = [...new Set((targeting.categories ?? []).map(normalizeCategory).filter(Boolean))].filter(
    (category) => !excludedSet.has(category.toLowerCase()),
  );

  return [
    ...included.map((category) => ({
      promotion_id: promotionId,
      category,
      is_excluded: false,
    })),
    ...excluded.map((category) => ({
      promotion_id: promotionId,
      category,
      is_excluded: true,
    })),
  ];
}

export type TargetedLine = {
  productId: string;
  category?: string | null;
  unitPrice: number;
  quantity: number;
};

export type TargetingRules = {
  includedProductIds?: readonly string[];
  excludedProductIds?: readonly string[];
  includedCategories?: readonly string[];
  excludedCategories?: readonly string[];
};

/**
 * Which basket lines a promotion touches, and what they are worth.
 *
 * Precedence: product exclusion > category exclusion > product inclusion >
 * category inclusion. No rules at all = whole basket.
 *
 * Minimum-order checks use the ELIGIBLE subtotal, not the whole cart: a
 * "GH₵200 of Feeding" promo with GH₵150 of Feeding + GH₵500 of Toys does not
 * qualify, even though the cart is large.
 */
export function matchPromotionTargeting(
  lines: readonly TargetedLine[],
  rules: TargetingRules,
): { eligibleLines: TargetedLine[]; eligibleSubtotal: number } {
  const excludedProducts = new Set(rules.excludedProductIds ?? []);
  const includedProducts = new Set(rules.includedProductIds ?? []);
  const excludedCategories = new Set(
    (rules.excludedCategories ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );
  const includedCategories = new Set(
    (rules.includedCategories ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );

  const hasProductRules = excludedProducts.size > 0 || includedProducts.size > 0;
  const hasCategoryRules = excludedCategories.size > 0 || includedCategories.size > 0;
  if (!hasProductRules && !hasCategoryRules) {
    const eligibleSubtotal = lines.reduce(
      (sum, line) => sum + Math.max(0, line.unitPrice) * Math.max(0, line.quantity),
      0,
    );
    return { eligibleLines: [...lines], eligibleSubtotal };
  }

  const eligibleLines = lines.filter((line) => {
    // 1. Product exclusion always wins.
    if (excludedProducts.has(line.productId)) return false;
    // 2. Category exclusion next.
    const category = (line.category || "").trim().toLowerCase();
    if (category && excludedCategories.has(category)) return false;
    // 3. Inclusions: a line qualifies if it matches EITHER list. When only
    //    one kind of inclusion exists, the other kind does not disqualify.
    const hasProductInclusion = includedProducts.size > 0;
    const hasCategoryInclusion = includedCategories.size > 0;
    if (!hasProductInclusion && !hasCategoryInclusion) return true;
    if (hasProductInclusion && includedProducts.has(line.productId)) return true;
    if (hasCategoryInclusion && category && includedCategories.has(category)) return true;
    return false;
  });

  const eligibleSubtotal = eligibleLines.reduce(
    (sum, line) => sum + Math.max(0, line.unitPrice) * Math.max(0, line.quantity),
    0,
  );
  return { eligibleLines, eligibleSubtotal };
}

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
