/**
 * What "options" mean for a product, and how a chosen combination is named.
 *
 * A variable product declares its attributes once — Colour: Pink, Blue —
 * and every variant is one combination of them. Two facts about this store
 * shape everything below.
 *
 * FIRST: the attribute list is an ARRAY, `[{name, values}]`, never an object
 * keyed by name. `products.options` is jsonb, and Postgres stores jsonb object
 * keys sorted by (length, bytes) — so `{"color": …, "size": …}` reads back
 * with `size` FIRST. The counter already shipped that bug and had to grow
 * `OPTION_ORDER` to undo it (src/domain/counter/grouping.ts). An array keeps
 * the seller's order, which is the order the pickers render in.
 *
 * SECOND: most products in production predate the `options` column entirely.
 * Their attributes exist only as `product_variants.option_values`, a jsonb
 * blob shaped `{"color":"Pink","size":"3M"}`. So every reader resolves options
 * as "declared, otherwise derived from the variants that exist". That is what
 * lets the new editor open an old product without deciding it is a simple
 * product and switching all of its variants off on first save.
 */

/** One attribute and the values a seller offers for it. */
export type ProductOption = {
  name: string;
  values: string[];
};

/** One chosen value per option, keyed by `optionKey(name)`. */
export type OptionSelection = Record<string, string>;

/** A `product_variants` row, from either the snake_case DB or a camelCase mapper. */
export type VariantOptionSource = {
  option_values?: unknown;
  optionValues?: unknown;
  is_active?: boolean;
  isActive?: boolean;
};

/** WooCommerce-style caps. Three pickers is already a lot on a tablet. */
export const maxOptionsPerProduct = 3;
export const maxValuesPerOption = 50;
export const maxVariantsPerProduct = 100;

/**
 * The title `product_variants.title` gets when there is nothing to say.
 *
 * `title` is NOT NULL, so an optionless product still needs one, and the seed
 * script writes this exact string. `optionLabel` in variant-options.ts knows to
 * drop it rather than render it as a size chip.
 */
export const defaultVariantTitle = "Default Title";

/**
 * A value as it will be SHOWN: tidied, but still what the seller typed.
 *
 * Nothing here changes a character a shopper would notice — "3–6 Months" keeps
 * the en-dash it was pasted with. Only the comparison key below folds it away.
 */
function normalizeText(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Collapse the differences that are not real differences.
 *
 * Dash folding is not cosmetic: sizes are typed as "3–6 Months" by whoever
 * copied them out of a supplier sheet and as "3-6 Months" by whoever typed
 * them, and those two must resolve to the same variant. Otherwise re-adding a
 * combination creates a second row and collides on the globally unique SKU.
 */
function foldForComparison(value: unknown): string {
  return (
    normalizeText(value)
      // U+2010..U+2015 is the hyphen/en-dash/em-dash family; U+2212 is minus.
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
  );
}

/** The jsonb key an option name is stored under. Lowercase, always. */
export function optionKey(name: unknown): string {
  return foldForComparison(name);
}

/** The comparable form of an option VALUE. Case-, whitespace- and dash-insensitive. */
export function optionValueKey(value: unknown): string {
  return foldForComparison(value);
}

/**
 * How options sort when nobody has told us an order.
 *
 * Shoppers and cashiers say "the blue 3M", never "the 3M blue", so colour
 * leads. Same list as the counter's `OPTION_ORDER`, for the same reason.
 */
const derivedOptionOrder = ["color", "colour", "size", "material"];

function optionRank(key: string): number {
  const index = derivedOptionOrder.indexOf(key);
  return index === -1 ? derivedOptionOrder.length : index;
}

function compareOptionKeys(first: string, second: string): number {
  const rank = optionRank(first) - optionRank(second);
  return rank !== 0 ? rank : first.localeCompare(second);
}

/**
 * A stored jsonb key turned back into something a seller can read.
 *
 * Only the casing changes, so `optionKey(displayName(key)) === key`. That
 * round-trip is load-bearing: a derived option named "Color" has to keep
 * looking up `option_values.color` on every variant.
 */
function displayName(key: string): string {
  return key.replace(/(^|\s)(\p{Ll})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
}

function dedupeValues(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of values) {
    const value = normalizeText(raw);
    if (!value) continue;
    const key = foldForComparison(value);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
    if (kept.length >= maxValuesPerOption) break;
  }
  return kept;
}

/** jsonb sometimes arrives as text. Never let that decide a product is simple. */
function coerceOptionEntries(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Read `products.options`, assuming nothing about what is in there.
 *
 * Tolerant on purpose: this column is new, the migration backfills it, and a
 * product whose options fail to parse must degrade to "derive from variants"
 * rather than throw on a storefront page. The object form
 * `{"Colour": ["Pink"]}` is accepted too — but it is re-sorted through the
 * same colour → size → alphabetical ranking as derived options, because jsonb
 * already destroyed whatever order it was written in.
 */
export function parseProductOptions(raw: unknown): ProductOption[] {
  const source = coerceOptionEntries(raw);
  if (!source || typeof source !== "object") return [];

  const entries: Array<{ name: string; values: unknown[]; sortKey: string | null }> = [];

  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const name = normalizeText(record.name);
      if (!name) continue;
      const values = Array.isArray(record.values)
        ? record.values
        : typeof record.values === "string"
          ? [record.values]
          : [];
      entries.push({ name, values, sortKey: null });
    }
  } else {
    for (const [name, values] of Object.entries(source as Record<string, unknown>)) {
      const clean = normalizeText(name);
      if (!clean) continue;
      entries.push({
        name: clean,
        values: Array.isArray(values) ? values : typeof values === "string" ? [values] : [],
        sortKey: optionKey(clean),
      });
    }
    entries.sort((first, second) => compareOptionKeys(first.sortKey || "", second.sortKey || ""));
  }

  const options: ProductOption[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = optionKey(entry.name);
    if (seen.has(key)) continue;
    const values = dedupeValues(entry.values);
    // An option with no values cannot produce a variant, so it is not an
    // option — it is a half-typed row somebody saved.
    if (values.length === 0) continue;
    seen.add(key);
    options.push({ name: entry.name, values });
    if (options.length >= maxOptionsPerProduct) break;
  }
  return options;
}

/** The cleaned `option_values` of one variant row, whatever case its keys arrived in. */
export function variantOptionValues(variant: VariantOptionSource | null | undefined): OptionSelection {
  const raw = variant?.optionValues ?? variant?.option_values;
  const source = coerceOptionEntries(raw);
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const values: OptionSelection = {};
  for (const [name, value] of Object.entries(source as Record<string, unknown>)) {
    const key = optionKey(name);
    const text = normalizeText(value);
    if (!key || !text) continue;
    values[key] = text;
  }
  return values;
}

/** Rows carrying neither flag are treated as live — a mapper that drops the column must not hide stock. */
export function variantIsActive(variant: VariantOptionSource | null | undefined): boolean {
  const flag = variant?.isActive ?? variant?.is_active;
  return flag === undefined ? true : Boolean(flag);
}

/**
 * Rebuild the option list from the variants that exist.
 *
 * The fallback for every product created before `products.options` existed.
 * Values keep the order they first appear in, which is the order the seed and
 * the importers wrote them; only the OPTIONS are ranked.
 *
 * Deactivated combinations drop out — that is what deactivating means, and a
 * dead chip on a product page is worse than a missing one. But if that leaves
 * nothing at all, every row is read instead: a product whose variants are all
 * switched off must still open in the editor as variable, or the next save
 * treats it as simple and the rows are lost for good.
 */
export function optionsFromVariants(variants: readonly VariantOptionSource[]): ProductOption[] {
  const live = variants.filter((variant) => variantIsActive(variant));
  const source = live.some((variant) => Object.keys(variantOptionValues(variant)).length > 0)
    ? live
    : variants;

  const collected = new Map<string, string[]>();
  for (const variant of source) {
    for (const [key, value] of Object.entries(variantOptionValues(variant))) {
      const existing = collected.get(key);
      if (existing) existing.push(value);
      else collected.set(key, [value]);
    }
  }

  return [...collected.entries()]
    .sort(([first], [second]) => compareOptionKeys(first, second))
    .slice(0, maxOptionsPerProduct)
    .map(([key, values]) => ({ name: displayName(key), values: dedupeValues(values) }))
    .filter((option) => option.values.length > 0);
}

/**
 * The options a product actually has: what it declares, or what its variants imply.
 *
 * Declared wins outright rather than merging with what the variants carry.
 * The declared list is the seller's intent — merging would resurrect the
 * "Blue" they just removed on the next page load.
 */
export function resolveProductOptions(
  raw: unknown,
  variants: readonly VariantOptionSource[],
): ProductOption[] {
  const declared = parseProductOptions(raw);
  return declared.length > 0 ? declared : optionsFromVariants(variants);
}

/**
 * A selection's own keys, in the order the product declares them.
 *
 * Returns the keys AS GIVEN so the caller can still index the selection with
 * them — a hand-built `{ Colour: "Pink" }` has to order the same as the
 * lowercase one that comes out of the database.
 */
function orderedKeys(selection: OptionSelection, options: readonly ProductOption[]): string[] {
  const present = new Map<string, string>();
  for (const key of Object.keys(selection)) {
    const normalized = optionKey(key);
    if (normalized && !present.has(normalized)) present.set(normalized, key);
  }

  const declared = options
    .map((option) => optionKey(option.name))
    .filter((key) => present.has(key));
  const leftovers = [...present.keys()]
    .filter((key) => !declared.includes(key))
    .sort(compareOptionKeys);

  return [...declared, ...leftovers].map((key) => present.get(key) as string);
}

/**
 * The name of one combination: "Pink / 3M".
 *
 * Order comes from `options`, never from `Object.keys(selection)` — the
 * selection may have been read straight out of jsonb, where the keys came back
 * sorted by length. Casing comes from the declared values, so a seller who
 * types "pink" still gets a variant called "Pink / 3M".
 */
export function selectionTitle(
  selection: OptionSelection,
  options: readonly ProductOption[] = [],
): string {
  const declaredCasing = new Map<string, Map<string, string>>();
  for (const option of options) {
    declaredCasing.set(
      optionKey(option.name),
      new Map(option.values.map((value) => [optionValueKey(value), value])),
    );
  }

  const parts = orderedKeys(selection, options)
    .map((key) => {
      const value = normalizeText(selection[key]);
      return declaredCasing.get(optionKey(key))?.get(optionValueKey(value)) ?? value;
    })
    .filter((value) => value.length > 0);

  return parts.length > 0 ? parts.join(" / ") : defaultVariantTitle;
}

/**
 * The identity of a combination — and therefore of a variant.
 *
 * A variant is `(product_id, signature)`, NOT its SKU. SKUs are globally
 * unique across the whole catalogue and are printed on labels, so they cannot
 * be regenerated when a seller renames something; and a removed variant is
 * only ever deactivated (purchase order lines are ON DELETE RESTRICT). This
 * signature is what lets re-adding "Pink / 3M" reactivate the original row,
 * with its stock and its order history, instead of colliding on that SKU.
 *
 * Keys are sorted, so the jsonb read-back order cannot change the answer.
 * Values are compared case-, whitespace- and dash-insensitively, so retyping
 * "pink" or "3-6 Months" still finds the row.
 */
export function selectionSignature(selection: OptionSelection): string {
  return Object.entries(selection || {})
    .map(([key, value]) => [optionKey(key), optionValueKey(value)] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** True when the product has attributes at all. There is no `product_type` column, by design. */
export function isVariableProduct(options: readonly ProductOption[]): boolean {
  return options.length > 0;
}
