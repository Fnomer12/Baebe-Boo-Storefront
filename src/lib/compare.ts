import type { StorefrontProduct } from "../components/storefront/catalog-data";

export type CompareSpecRow = { label: string; values: string[] };

// Merge the specification lists of the compared products into aligned rows,
// preserving first-seen label order and padding gaps with an em dash.
export function buildCompareSpecRows(products: StorefrontProduct[]): CompareSpecRow[] {
  const labels: string[] = [];
  for (const product of products) {
    for (const spec of product.specifications) {
      if (!labels.includes(spec.label)) labels.push(spec.label);
    }
  }
  return labels.map((label) => ({
    label,
    values: products.map((product) => product.specifications.find((spec) => spec.label === label)?.value ?? "—"),
  }));
}
