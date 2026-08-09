/**
 * The admin catalogue's own shapes, and the decisions the server makes about them.
 *
 * Everything here used to live inside `src/lib/admin/catalog.ts`, which imports
 * `server-only` and talks to PostgREST — so none of it could be exercised
 * without a database. These are the rules that were wrong often enough to be
 * worth a test: which fields a patch is allowed to touch on a variable product,
 * what a product's headline price is, and what a caller's omission means.
 */

import {
  optionKey,
  selectionSignature,
  variantIsActive,
  variantOptionValues,
  type OptionSelection,
  type ProductOption,
} from "./catalog/product-options";
import type { DesiredVariant, ExistingVariant } from "./catalog/variant-reconcile";

export type AdminInventoryLevel = {
  id: string;
  variantId: string;
  shopId: string;
  shopName: string;
  shopLocation: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  updatedAt: string;
};

export type AdminProductVariant = {
  id: string;
  sku: string;
  title: string;
  price: number;
  /**
   * The was-price, for a strikethrough. Null when the version is not on offer.
   *
   * Optional only so that callers written before variants could carry their own
   * data still typecheck; every server response sets it.
   */
  compareAtPrice?: number | null;
  active: boolean;
  isDefault: boolean;
  optionValues: Record<string, unknown>;
  /** This version's own photo, when it has one. Empty means "use the product's". */
  imageUrl?: string;
  inventory: AdminInventoryLevel[];
};

export type AdminProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  ageRange: string;
  gender: string;
  /** The "from" price: the cheapest live version. Maintained by the server. */
  price: number;
  sku: string;
  imageUrl: string;
  gallery: string[];
  active: boolean;
  /** Pinned into the homepage "Family favourites" slots by the admin. */
  featured: boolean;
  createdAt: string;
  /**
   * Declared attributes, or the ones its variants imply. An empty list is what
   * "simple product" means — there is no `product_type` column, by design.
   *
   * Optional for the same reason as `compareAtPrice` above: the server always
   * sends it, so a reader should treat `undefined` as "not loaded", not "simple".
   */
  options?: ProductOption[];
  variants: AdminProductVariant[];
};

export type AdminProductFilters = {
  query: string;
  status: "all" | "active" | "archived";
  category: string;
};

export function filterAdminProducts(
  products: AdminProduct[],
  filters: AdminProductFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();

  return products.filter((product) => {
    const matchesQuery =
      !query ||
      [
        product.name,
        product.sku,
        product.category,
        ...product.variants.map((variant) => variant.sku),
      ].some((value) => value.toLocaleLowerCase().includes(query));
    const matchesStatus =
      filters.status === "all" ||
      (filters.status === "active" ? product.active : !product.active);
    const matchesCategory =
      filters.category === "all" || product.category === filters.category;

    return matchesQuery && matchesStatus && matchesCategory;
  });
}

/** The vocabulary `listProducts` filters on: a lifecycle, or no filter at all. */
export type ProductStatusFilter = "active" | "inactive";

/**
 * The `status` query parameter, translated into what the query understands.
 *
 * THE BUG: the workspace's dropdown speaks `all | active | archived` — the
 * words a shop owner reads — while the route understood only
 * `active | inactive` and dropped anything else on the floor. That was
 * invisible while the whole catalogue was paged in the browser, because
 * `filterAdminProducts` re-applied the filter client-side. Once paging moved
 * into Postgres it meant picking "Archived" returned page one of EVERYTHING,
 * with no error and no empty state to explain it.
 *
 * `inactive` is still accepted, so a hand-written link or an older client keeps
 * working; anything else — including `all` and a missing parameter — means "do
 * not filter", which is what the dropdown's first entry says.
 */
export function parseProductStatusFilter(
  raw: string | null | undefined,
): ProductStatusFilter | undefined {
  const value = (raw || "").trim().toLowerCase();
  if (value === "active") return "active";
  if (value === "archived" || value === "inactive") return "inactive";
  return undefined;
}

export type PricedVariant = {
  price: number | string | null | undefined;
  isActive?: boolean;
};

/**
 * The number `products.price` should hold: the cheapest version on sale.
 *
 * `products.price` is what the listing grid, the counter search and every
 * pre-variant query read, while the product page reads the variants. When the
 * two disagree a shopper sees GH₵240 on the card and GH₵180 on the page, which
 * is the divergence this fixes at the source — the server recomputes this after
 * every write rather than trusting whatever the create form happened to send.
 *
 * Switched-off versions do not count: a discontinued GH₵29 row must not keep
 * advertising "From GH₵29.00". If nothing is live, every row counts, because a
 * listing showing GH₵0.00 is worse than one showing a stale price — and if
 * there is nothing at all, the current value stands.
 *
 * Zero prices are skipped for the same reason: a variant left at 0 is almost
 * always a number that failed to arrive, and it drags the whole listing to
 * "From GH₵0.00". This matches `priceRange` on the storefront side.
 */
export function fromPrice(
  variants: readonly PricedVariant[],
  fallback: number,
): number {
  const priced = (rows: readonly PricedVariant[]) =>
    rows
      .map((row) => Number(row.price))
      .filter((price) => Number.isFinite(price) && price > 0);

  const live = priced(variants.filter((variant) => variant.isActive !== false));
  const prices = live.length > 0 ? live : priced(variants);
  return prices.length > 0 ? Math.min(...prices) : fallback;
}

export type ProductPatchFields = {
  name?: string;
  description?: string;
  category?: string;
  ageRange?: string;
  gender?: string;
  sku?: string;
  price?: number;
  imageUrl?: string;
  gallery?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
};

export type ProductPatchPlan = {
  /** Fields to write to the `products` row. */
  product: ProductPatchFields;
  /** Fields to mirror onto the single default variant. Empty for a variable product. */
  defaultVariant: { sku?: string; price?: number };
  /**
   * `is_active` to push onto EVERY variant, or null — the usual answer — when
   * the patch must leave the versions exactly as it found them. See the ACTIVE
   * rule below: this is only ever `true`, and only to rescue a product archived
   * by the code that used to write this flag in both directions.
   */
  variantsActive: boolean | null;
  /** Why the patch cannot be applied at all — a 409 message a shop owner can act on. */
  rejection: string | null;
};

export type ProductPatchContext = {
  isVariable: boolean;
  /** Whether any version of the product is currently switched on. */
  hasLiveVariant: boolean;
};

/**
 * What a product patch is allowed to touch, given whether the product has options.
 *
 * Three rules, each of which was previously wrong:
 *
 *   * PRICE. The old code wrote `patch.price` to the product AND to the default
 *     variant. On a variable product that silently repriced one version — the
 *     one that happened to be default — and left the rest, so the grid and the
 *     product page disagreed. There is no single price to set, so the patch is
 *     refused outright rather than half-applied.
 *   * SKU. Mirroring the product SKU onto the default variant is right for a
 *     simple product (they are the same thing) and wrong for a variable one:
 *     variant SKUs are generated per combination and printed on shelf labels,
 *     so renaming the parent must not rewrite one of its children.
 *   * ACTIVE. A product's archived state lives on `products.is_active` and
 *     NOWHERE ELSE.
 *
 * THE ACTIVE BUG, at length, because the fix looks like a removal.
 *
 * Archiving used to write `is_active = false` onto every variant and restoring
 * wrote `true` back. But `is_active = false` on a variant is also the ONLY
 * record this system keeps of "the seller removed this version" — removal is
 * never a delete, because purchase-order lines are ON DELETE RESTRICT and a
 * delete would cascade away the stock the shop physically has (see the header
 * of `catalog/variant-reconcile.ts`). So archiving a product erased every
 * removal it had ever recorded, and restoring it put those versions back on
 * sale, priced as they were the day they were withdrawn.
 *
 * Nothing is lost by leaving the versions alone, because every read that can
 * sell something already filters on the product itself:
 * `lib/counter/catalog.ts` (the till), `lib/checkout/resolve-basket.ts`
 * (checkout), `lib/storefront-product.ts` and
 * `components/storefront/catalog-data.ts` (the storefront), and the legacy
 * `product_shop_availability` rows are forced unavailable by `rollUpByShop`.
 * A new reader of `product_variants` must join `products` and check
 * `is_active`; there is no second copy of that fact to lean on.
 *
 * The one exception is the rescue: a product archived by the OLD code already
 * has every version switched off, and restoring it would otherwise hand back a
 * live product nobody can buy. When not one version is on there is nothing left
 * to preserve, so they all come back. A product archived from here on always
 * has a live version, so it never takes this path.
 */
export function planProductPatch(
  patch: ProductPatchFields,
  context: ProductPatchContext,
): ProductPatchPlan {
  const product: ProductPatchFields = { ...patch };
  const defaultVariant: { sku?: string; price?: number } = {};
  let rejection: string | null = null;

  if (context.isVariable) {
    if (patch.price !== undefined) {
      rejection =
        "This product's price is set per version. Open the versions editor to change what each one costs.";
    }
    // `price` never reaches the product row on a variable product: it is
    // recomputed from the live variants after every write.
    delete product.price;
  } else {
    if (patch.sku !== undefined) defaultVariant.sku = patch.sku;
    if (patch.price !== undefined) defaultVariant.price = patch.price;
  }

  return {
    product,
    defaultVariant,
    variantsActive: patch.isActive === true && !context.hasLiveVariant ? true : null,
    rejection,
  };
}

/**
 * The variants a create request implies.
 *
 * A simple product still has exactly one row to sell, and nothing in the upload
 * form asks for it — so one is synthesized, sharing the product's SKU and
 * carrying `defaultVariantTitle` rather than the product name (a 70-character
 * name renders as an unusable size chip on the storefront).
 *
 * A request that already lists versions is passed through untouched;
 * `planVariants` decides which one is default.
 */
export function desiredVariantsForCreate(input: {
  options: readonly ProductOption[];
  variants: readonly DesiredVariant[];
  price: number;
  sku: string;
  isActive: boolean;
}): DesiredVariant[] {
  if (input.variants.length > 0) return [...input.variants];
  return [
    {
      sku: input.sku,
      optionValues: {},
      price: input.price,
      isDefault: true,
      isActive: input.isActive,
    },
  ];
}

/**
 * A variant's identity: the signature over the DECLARED options only.
 *
 * Mirrors `normalizeSelection` inside `catalog/variant-reconcile.ts`, and is
 * shared rather than re-derived because everything that lines a desired row up
 * with a stored one has to agree on what "the same version" means. A stray
 * legacy key on a stored row — `{"gender":"Girls"}` on a product that no longer
 * offers it — is not part of the combination, and a product that declares no
 * options at all has exactly one version whatever its rows carry.
 */
export function declaredSignature(
  selection: OptionSelection | undefined,
  options: readonly ProductOption[],
): string {
  const declared = new Set(options.map((option) => optionKey(option.name)));
  const restricted: OptionSelection = {};
  for (const [name, value] of Object.entries(selection || {})) {
    const key = optionKey(name);
    if (!key || !declared.has(key)) continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (text) restricted[key] = text;
  }
  return selectionSignature(restricted);
}

type CarriedField = "costPrice" | "weightGrams";
const carriedFields: CarriedField[] = ["costPrice", "weightGrams"];

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Live first, then the current default — the order `planVariants` buckets in. */
function preferredMatchFirst(first: ExistingVariant, second: ExistingVariant): number {
  const live = Number(variantIsActive(second)) - Number(variantIsActive(first));
  if (live !== 0) return live;
  return (
    Number(Boolean(second.isDefault ?? second.is_default)) -
    Number(Boolean(first.isDefault ?? first.is_default))
  );
}

/**
 * Keep the fields the editor CANNOT send, and only those.
 *
 * THE BUG: the variant grid on screen shows price and stock. `cost_price` and
 * `weight_grams` are not on it — `cost_price` is deliberately kept out of the
 * anon column grant and never reaches the browser at all. A payload that omits
 * them is not saying "clear them", but `planVariants` reads an absent field as
 * null and would write null, wiping the cost basis every profit report is
 * built on, on every save of every variable product.
 *
 * `compareAtPrice` is deliberately NOT carried, and used to be. It IS on the
 * grid — the "Was" price, in a box the seller can empty — so an omitted value
 * is a cleared one (`blankToUndefined` on the schema turns the empty box into
 * an absent field). Carrying it forward meant clearing that box silently did
 * nothing; and clearing it while raising the price hit the
 * `compare_at_price >= price` CHECK, so the save came back as a 409 about
 * nothing the seller could see on screen. Clearing a field means clearing it.
 *
 * Matching is by id first (the editor round-trips ids for rows it loaded) and
 * then by DECLARED-option signature, which is the identity `planVariants` uses
 * — including its preference for the live row over a legacy twin. The two must
 * agree: when they did not, converting a variable product to a simple one
 * matched the cost basis to one row here and wrote the price to another there,
 * so the survivor came out of the save with its cost price wiped.
 */
export function carryForwardVariantFields<Desired extends DesiredVariant>(
  desired: readonly Desired[],
  existing: readonly ExistingVariant[],
  options: readonly ProductOption[],
): Array<Desired & Pick<DesiredVariant, CarriedField>> {
  const byId = new Map(existing.map((variant) => [variant.id, variant]));
  const bySignature = new Map<string, ExistingVariant>();
  for (const variant of [...existing].sort(preferredMatchFirst)) {
    const signature = declaredSignature(variantOptionValues(variant), options);
    if (!bySignature.has(signature)) bySignature.set(signature, variant);
  }

  return desired.map((row) => {
    const filled: Desired & Pick<DesiredVariant, CarriedField> = { ...row };
    const match =
      (row.id ? byId.get(row.id) : undefined) ||
      bySignature.get(declaredSignature(row.optionValues, options));
    if (!match) return filled;

    for (const field of carriedFields) {
      if (filled[field] !== undefined) continue;
      const carried = toNumberOrNull(match[field]);
      if (carried !== null) filled[field] = carried;
    }
    return filled;
  });
}

/**
 * A search term, safe to drop into a PostgREST `or=(…)` filter.
 *
 * PostgREST splits that filter on commas and parentheses, so a shop owner
 * searching for "Romper, Pink" produced a 400 rather than a result set. Wrapping
 * the pattern in double quotes makes those literal; only `"` and `\` then need
 * escaping.
 *
 * `%` and `_` are left alone: they are LIKE wildcards, so "CL_001" also matches
 * "CL-001". Over-matching a search box is not a bug worth mangling SKUs for.
 */
export function likeFilterTerm(query: string): string {
  return query.trim().replace(/[\\"]/g, (character) => `\\${character}`);
}

/** Every SKU in a batch that Postgres already knows about. */
export function skuConflictMessage(skus: readonly string[]): string {
  const named = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))].sort();
  if (named.length === 0) {
    return "One of these product codes is already used elsewhere in your catalogue. Give it a different code.";
  }
  if (named.length === 1) {
    return `The product code ${named[0]} is already used elsewhere in your catalogue. Give this version a different code.`;
  }
  return `These product codes are already used elsewhere in your catalogue: ${named.join(", ")}. Give them different codes.`;
}

/**
 * The SKU named in a Postgres unique-violation, if it says.
 *
 * The pre-flight select is a race, not a guard — two admins saving at once
 * still reach the unique index — so 23505 has to produce the same sentence the
 * pre-flight would have. Postgres puts the offending value in `details`:
 * `Key (sku)=(BB-001-PINK) already exists.`
 */
export function skuFromUniqueViolation(error: {
  details?: string | null;
  message?: string | null;
}): string | null {
  const text = `${error.details || ""} ${error.message || ""}`;
  const match = /\(sku\)=\(([^)]*)\)/i.exec(text);
  const sku = match?.[1]?.trim();
  return sku ? sku : null;
}
