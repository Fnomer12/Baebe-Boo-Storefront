/**
 * The one list of categories, ages and genders the catalogue admits.
 *
 * These were literals at the top of `ProductUploadWorkspace.tsx`, which is the
 * CREATE form only. The edit form has its own copies, and they had already
 * drifted — so a product filed under "Baby Clothing" on creation could come
 * back as something else on edit, and `products.category` is free text, so
 * nothing downstream noticed. The storefront's category pages are built by
 * slugifying this column, which means a drifted spelling is a page nobody can
 * reach.
 *
 * `products.category` stays free text (changing that is a migration and a data
 * cleanup), so this module cannot enforce the list. What it can do is make
 * every form offer the same one.
 */

export const productCategories = [
  "Baby Clothing",
  "Baby Shoes",
  "Feeding",
  "Toys",
  "School Essentials",
  "Nursery",
  "Gift Sets",
  "Maternity",
  "Accessories",
] as const;

/** En-dashes, not hyphens: this is the exact text stored in `products.age_range`. */
export const productAgeRanges = [
  "0–3 Months",
  "3–6 Months",
  "6–12 Months",
  "1–2 Years",
  "2–4 Years",
  "4–6 Years",
  "6+ Years",
] as const;

export const productGenders = ["Boys", "Girls", "Unisex"] as const;

export type ProductCategory = (typeof productCategories)[number];
export type ProductAgeRange = (typeof productAgeRanges)[number];
export type ProductGender = (typeof productGenders)[number];

/** What a generated SKU starts with, so a stockroom can read the category off the label. */
export const categorySkuPrefixes: Record<string, string> = {
  "Baby Clothing": "CL",
  "Baby Shoes": "SH",
  Feeding: "FD",
  Toys: "TY",
  "School Essentials": "SE",
  Nursery: "NS",
  "Gift Sets": "GS",
  Maternity: "MT",
  Accessories: "AC",
};

/** `XX` for anything off the list — a legacy category still has to produce a valid SKU. */
export function skuPrefixForCategory(category: string): string {
  return categorySkuPrefixes[category] || "XX";
}

export function isKnownCategory(category: string): category is ProductCategory {
  return (productCategories as readonly string[]).includes(category);
}

/**
 * A fresh product SKU: `CL-2612345ABC`.
 *
 * Random rather than sequential because there is no counter to read: the SKU
 * is generated in the browser before the row exists. Collisions are the
 * database's problem — `products.sku` is unique — and the form surfaces the
 * failure rather than retrying silently.
 *
 * `now` and `random` are injectable so the shape can be pinned by a test
 * instead of being asserted against whatever today happens to be. The padding
 * is not cosmetic either: `Math.random().toString(36)` occasionally yields a
 * short string, and the original produced a two-character suffix when it did.
 */
export function generateSku(
  category: string,
  { now = () => new Date(), random = Math.random }: { now?: () => Date; random?: () => number } = {},
): string {
  const prefix = skuPrefixForCategory(category);
  const year = now().getFullYear().toString().slice(-2);
  const number = String(Math.floor(random() * 90000) + 10000);
  const suffix = random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "X");
  return `${prefix}-${year}${number}${suffix}`;
}
