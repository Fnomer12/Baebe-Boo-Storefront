/**
 * Turning an option list into the grid of variants it implies, and naming them.
 *
 * "Generate variants" is the one button a seller presses after declaring
 * Colour and Size, so the order it produces is the order they proof-read. It
 * varies the FIRST option slowest — Pink/3M, Pink/6M, Blue/3M, Blue/6M — so
 * the table reads as one block per colour, which is how the seed writes them
 * and how a stock sheet is laid out.
 */

import {
  maxVariantsPerProduct,
  optionKey,
  type OptionSelection,
  type ProductOption,
} from "./product-options";

/** `product_variants.sku` is text, but every other SKU in this catalogue fits comfortably. */
export const maxSkuLength = 80;

/**
 * How many variants an option list implies.
 *
 * No options is one variant, not none: a simple product still has exactly one
 * row to sell. An option with no values is zero, because there is nothing to
 * choose.
 */
export function matrixSize(options: readonly ProductOption[]): number {
  return options.reduce((total, option) => total * option.values.length, 1);
}

/**
 * Every combination, first option varying slowest.
 *
 * Generation stops at `limit`. Three options with fifty values each is 125,000
 * combinations, and building that array on a shop tablet is a hang rather than
 * an error message; callers compare `matrixSize` against the cap and say so.
 * Truncation still returns a true prefix of the full order, so the first N
 * rows are the same rows they would have been.
 */
export function variantMatrix(
  options: readonly ProductOption[],
  limit: number = maxVariantsPerProduct,
): OptionSelection[] {
  const ceiling = Math.max(0, Math.floor(limit));
  let rows: OptionSelection[] = [{}];

  for (const option of options) {
    const key = optionKey(option.name);
    const next: OptionSelection[] = [];
    for (const row of rows) {
      for (const value of option.values) {
        if (next.length >= ceiling) break;
        next.push({ ...row, [key]: value });
      }
      if (next.length >= ceiling) break;
    }
    rows = next;
    if (rows.length === 0) return [];
  }

  return rows.slice(0, ceiling);
}

/**
 * One option value, as it appears inside a SKU.
 *
 * Strips to A-Z0-9 after folding accents and decomposing anything exotic, so
 * "3–6 Months" (en-dash, copied out of a supplier sheet) and "3-6 Months" both
 * become `36MONTHS`, and "Rosé" becomes `ROSE`. A value with no Latin letters
 * or digits at all yields "" and is dropped by the caller rather than emitting
 * an empty `--` gap.
 */
export function skuSegment(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/** The product SKU, reduced to what `skuSchema` will accept as a stem. */
function sanitizeBase(base: unknown): string {
  if (typeof base !== "string" && typeof base !== "number") return "";
  return String(base)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._/-]+/g, "-")
    .replace(/^[^A-Z0-9]+/, "")
    .replace(/[-.]+$/, "");
}

/**
 * Assemble under the length cap, sacrificing the BASE first.
 *
 * The segments carry the meaning — a picker in the stockroom needs to see
 * PINK-3M, not a truncated product stem — and the collision suffix is never
 * sacrificed, because without it the SKU is not unique and the insert fails on
 * the global unique index.
 */
function assemble(base: string, segments: readonly string[], suffix: string): string {
  const tail = segments.length > 0 ? `-${segments.join("-")}` : "";
  const budget = Math.max(0, maxSkuLength - suffix.length);
  const head = base.slice(0, Math.max(0, budget - tail.length));
  const body = `${head}${tail}`.slice(0, budget).replace(/^[^A-Z0-9]+/, "");
  // `skuSchema` requires the first character to be alphanumeric, so a product
  // whose name transliterates to nothing still needs something to be called.
  return body ? `${body}${suffix}` : `SKU${suffix}`;
}

/**
 * A SKU for one combination, unique against everything already spoken for.
 *
 * `product_variants.sku` is UNIQUE across the whole table, not per product, so
 * `taken` has to include every SKU in play — the product's existing variants
 * and the ones being generated alongside this one — or the insert fails
 * halfway and leaves a half-built product. Comparison is case-insensitive:
 * Postgres would happily hold both `BB-001-PINK` and `bb-001-pink`, but a
 * stockroom cannot tell them apart.
 */
export function generateVariantSku(
  base: string,
  selection: OptionSelection,
  options: readonly ProductOption[] = [],
  taken: Iterable<string> = [],
): string {
  const declared = options.map((option) => optionKey(option.name)).filter((key) => key in selection);
  const leftovers = Object.keys(selection).filter((key) => !declared.includes(key)).sort();
  const segments = [...declared, ...leftovers]
    .map((key) => skuSegment(selection[key]))
    .filter((segment) => segment.length > 0);

  const stem = sanitizeBase(base);
  const claimed = new Set<string>();
  for (const sku of taken) {
    if (typeof sku === "string" && sku.trim()) claimed.add(sku.trim().toUpperCase());
  }

  let candidate = assemble(stem, segments, "");
  for (let attempt = 2; claimed.has(candidate.toUpperCase()); attempt += 1) {
    candidate = assemble(stem, segments, `-${attempt}`);
  }
  return candidate;
}
