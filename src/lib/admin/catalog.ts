import "server-only";

import type {
  InventoryAdjustmentInput,
  ProductCreateInput,
  ProductPatchInput,
  ProductVariantsReplaceInput,
  VariantInput,
} from "./catalog-schemas";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordAudit, type AdminActor } from "./audit";
import {
  resolveProductOptions,
  type OptionSelection,
  type ProductOption,
} from "@/domain/catalog/product-options";
import {
  planVariants,
  type ExistingVariant,
  type VariantProblem,
} from "@/domain/catalog/variant-reconcile";
import { expandStockPlan, rollUpByShop } from "@/domain/catalog/shop-stock";
import {
  carryForwardVariantFields,
  declaredSignature,
  desiredVariantsForCreate,
  fromPrice,
  likeFilterTerm,
  planProductPatch,
  skuConflictMessage,
  skuFromUniqueViolation,
  type ProductStatusFilter,
} from "@/domain/admin-products";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  age_range: string | null;
  gender: string | null;
  sku: string | null;
  price: number | string;
  image_url: string | null;
  is_active: boolean;
  /** Absent until the 20260808 featured-products migration is applied. */
  is_featured?: boolean;
  created_at: string;
  /** Absent until the variable-products migration is applied. */
  options?: unknown;
};

type ProductMediaRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  media_type: "image" | "video" | "model_3d";
  url: string;
  alt_text: string | null;
  sort_order: number;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  price: number | string;
  compare_at_price: number | string | null;
  option_values: Record<string, unknown> | null;
  is_default: boolean;
  is_active: boolean;
};

/** The extra columns the reconciler needs and the browser must never see. */
type VariantPlanningRow = VariantRow & {
  cost_price: number | string | null;
  weight_grams: number | null;
};

type InventoryRow = {
  id: string;
  variant_id: string;
  shop_id: string;
  on_hand: number;
  reserved: number;
  reorder_point: number;
  updated_at: string;
};

type ShopRow = {
  id: string;
  name: string;
  location: string;
  is_active: boolean;
};

type PostgrestFailure = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export class AdminCatalogError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Per-input messages, keyed by the same dotted paths zod produces. */
    public readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AdminCatalogError";
  }
}

function databaseFailure(message: string): never {
  throw new AdminCatalogError(409, message);
}

function makeSku() {
  return `BB-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

/**
 * `product_variants.sku` is unique across the whole table, so any collision is a
 * 23505 with the offending value buried in the driver's `details`. Turning it
 * into the same sentence the pre-flight produces means two admins saving at
 * once get an instruction rather than "Could not save the product's versions."
 */
function skuConflict(error: PostgrestFailure, attempted: readonly string[]): never {
  const named = skuFromUniqueViolation(error);
  throw new AdminCatalogError(409, skuConflictMessage(named ? [named] : attempted));
}

/** Every problem the reconciler found, attached to the row that caused it. */
function variantPlanFailure(problems: readonly VariantProblem[]): never {
  const errors: Record<string, string> = {};
  for (const problem of problems) {
    const path = (problem.path || ["variants"]).join(".");
    if (!errors[path]) errors[path] = problem.message;
  }
  throw new AdminCatalogError(400, problems[0].message, errors);
}

async function ensureActiveShops(shopIds: string[]) {
  const unique = [...new Set(shopIds)];
  if (unique.length === 0) return;
  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("id")
    .in("id", unique)
    .eq("is_active", true);
  if (error || (data || []).length !== unique.length) {
    throw new AdminCatalogError(
      400,
      "One or more selected shops are not active.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* products.options — a column that may not exist yet                          */
/* -------------------------------------------------------------------------- */

const productColumns =
  "id,name,description,category,age_range,gender,sku,price,image_url,is_active,is_featured,created_at";
/**
 * NEVER `cost_price` or `barcode`. Both are deliberately outside the anon
 * column grant (20260721_z_commerce_foundation.sql), and everything selected
 * here is serialized straight to the admin client.
 */
const variantColumns =
  "id,product_id,sku,title,price,compare_at_price,option_values,is_default,is_active";
const variantPlanningColumns = `${variantColumns},cost_price,weight_grams`;

/** Postgres "column does not exist"; PGRST204 is PostgREST's schema-cache equivalent on writes. */
const missingColumnCodes = new Set(["42703", "PGRST204"]);

/**
 * The human applies migrations, so this process can outlive the schema it booted on.
 *
 * A present column is cached forever — it cannot go away. An absent one is
 * re-probed, because a worker that cached "absent" at boot would go on quietly
 * refusing to persist declared option lists long after the migration landed.
 */
let optionsColumnPresent: boolean | null = null;
let optionsColumnCheckedAt = 0;
const optionsColumnRecheckMs = 60_000;

function rememberOptionsColumn(present: boolean) {
  optionsColumnPresent = present;
  optionsColumnCheckedAt = Date.now();
}

function shouldTryOptionsColumn(): boolean {
  if (optionsColumnPresent !== false) return true;
  return Date.now() - optionsColumnCheckedAt > optionsColumnRecheckMs;
}

function isMissingColumn(error: PostgrestFailure | null): boolean {
  return Boolean(error?.code && missingColumnCodes.has(error.code));
}

async function fetchProductRows(productIds?: string[]): Promise<ProductRow[]> {
  if (productIds && productIds.length === 0) return [];

  const run = async (columns: string) => {
    let query = supabaseAdmin
      .from("products")
      .select(columns)
      .order("created_at", { ascending: false });
    if (productIds) query = query.in("id", productIds);
    return query;
  };

  if (shouldTryOptionsColumn()) {
    const attempt = await run(`${productColumns},options`);
    if (!attempt.error) {
      rememberOptionsColumn(true);
      return (attempt.data || []) as unknown as ProductRow[];
    }
    if (!isMissingColumn(attempt.error)) databaseFailure("Could not load products.");
    rememberOptionsColumn(false);
  }

  const fallback = await run(productColumns);
  if (fallback.error) databaseFailure("Could not load products.");
  return (fallback.data || []) as unknown as ProductRow[];
}

/**
 * Persist a declared option list, if there is anywhere to put it.
 *
 * Before the migration there is not, and that has to be survivable rather than
 * fatal: `resolveProductOptions` derives the same list back from the variants
 * that were just written, so the editor still opens the product as variable.
 */
async function writeProductOptions(productId: string, options: ProductOption[]) {
  if (!shouldTryOptionsColumn()) return;
  const { error } = await supabaseAdmin
    .from("products")
    .update({ options })
    .eq("id", productId);
  if (!error) {
    rememberOptionsColumn(true);
    return;
  }
  if (isMissingColumn(error)) {
    rememberOptionsColumn(false);
    return;
  }
  databaseFailure("Could not save the product's options.");
}

/* -------------------------------------------------------------------------- */
/* reads                                                                       */
/* -------------------------------------------------------------------------- */

async function loadCatalogRows(productIds?: string[]) {
  const products = await fetchProductRows(productIds);
  const ids = products.map((product) => product.id);
  if (ids.length === 0) return [];

  const [
    { data: variantData, error: variantError },
    { data: availabilityData, error: availabilityError },
    { data: mediaData, error: mediaError },
  ] = await Promise.all([
    supabaseAdmin.from("product_variants").select(variantColumns).in("product_id", ids),
    supabaseAdmin
      .from("product_shop_availability")
      .select("product_id,shop_id,stock_quantity,is_available")
      .in("product_id", ids),
    supabaseAdmin
      .from("product_media")
      .select("id,product_id,variant_id,media_type,url,alt_text,sort_order")
      .in("product_id", ids)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  if (variantError) databaseFailure("Could not load product versions.");
  if (mediaError) databaseFailure("Could not load product media.");
  if (availabilityError) databaseFailure("Could not load complete product details.");

  const variants = (variantData || []) as unknown as VariantRow[];
  const availability = (availabilityData || []) as Array<{
    product_id: string;
    shop_id: string;
    stock_quantity: number | string;
    is_available: boolean;
  }>;
  const media = (mediaData || []) as unknown as ProductMediaRow[];

  const variantIds = variants.map((variant) => variant.id);
  const { data: inventoryData, error: inventoryError } = variantIds.length
    ? await supabaseAdmin
        .from("inventory_levels")
        .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
        .in("variant_id", variantIds)
    : { data: [], error: null };
  if (inventoryError) databaseFailure("Could not load stock levels.");
  const inventory = (inventoryData || []) as unknown as InventoryRow[];

  const shopIds = [
    ...new Set([
      ...availability.map((row) => row.shop_id),
      ...inventory.map((row) => row.shop_id),
    ]),
  ];
  const { data: shopData, error: shopError } = shopIds.length
    ? await supabaseAdmin
        .from("shops")
        .select("id,name,location,is_active")
        .in("id", shopIds)
    : { data: [], error: null };
  if (shopError) databaseFailure("Could not load shop details.");
  const shops = (shopData || []) as unknown as ShopRow[];

  return products.map((product) => {
    const ownVariants = variants.filter((variant) => variant.product_id === product.id);
    const ownMedia = media.filter((row) => row.product_id === product.id);

    return {
      id: product.id,
      name: product.name,
      description: product.description || "",
      category: product.category,
      ageRange: product.age_range || "",
      gender: product.gender || "",
      sku:
        product.sku ||
        ownVariants.find((variant) => variant.is_default)?.sku ||
        "",
      price: Number(product.price),
      imageUrl: product.image_url || "",
      // Variant photos are filtered out: the gallery is the product's own strip,
      // and a variant's image belongs to the chip that selects it.
      gallery: ownMedia.filter((row) => !row.variant_id).map((row) => row.url),
      active: product.is_active,
      featured: product.is_featured === true,
      createdAt: product.created_at,
      // Declared when the column exists, derived from the variants when it does
      // not — which is the whole pre-migration catalogue.
      options: resolveProductOptions(product.options, ownVariants),
      availability: availability
        .filter((row) => row.product_id === product.id)
        .map((row) => ({
          shopId: row.shop_id,
          stockQuantity: Number(row.stock_quantity),
          isAvailable: row.is_available,
        })),
      variants: ownVariants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        price: Number(variant.price),
        compareAtPrice:
          variant.compare_at_price === null || variant.compare_at_price === undefined
            ? null
            : Number(variant.compare_at_price),
        isDefault: variant.is_default,
        active: variant.is_active,
        optionValues: variant.option_values || {},
        imageUrl: ownMedia.find((row) => row.variant_id === variant.id)?.url || "",
        inventory: inventory
          .filter((level) => level.variant_id === variant.id)
          .map((level) => {
            const shop = shops.find((row) => row.id === level.shop_id);
            return {
              id: level.id,
              shopId: level.shop_id,
              shopName: shop?.name || "Shop",
              shopLocation: shop?.location || "",
              onHand: level.on_hand,
              reserved: level.reserved,
              available: level.on_hand - level.reserved,
              reorderPoint: level.reorder_point,
              updatedAt: level.updated_at,
            };
          }),
      })),
    };
  });
}

/**
 * One page of products.
 *
 * The filter and the page used to be applied in JavaScript over EVERY product,
 * which meant the workspace loaded the whole catalogue — and, once products
 * have variants, every variant and every stock level of every product — to show
 * twenty-four rows. Postgres does both now, and only the ids that survive are
 * hydrated.
 */
export async function listProducts(options?: {
  query?: string;
  status?: ProductStatusFilter;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, options?.page ?? 1);
  // Capped because the page size becomes an `in (…)` list of ids on five more
  // queries; an unbounded one from a hand-rolled request is a slow 500.
  const pageSize = Math.min(200, Math.max(1, options?.pageSize ?? 24));
  const start = (page - 1) * pageSize;

  let idQuery = supabaseAdmin
    .from("products")
    .select("id", { count: "exact" })
    .order("created_at", { ascending: false });
  if (options?.status === "active") idQuery = idQuery.eq("is_active", true);
  else if (options?.status === "inactive") idQuery = idQuery.eq("is_active", false);

  const term = likeFilterTerm(options?.query || "");
  if (term) {
    idQuery = idQuery.or(
      `name.ilike."*${term}*",sku.ilike."*${term}*",category.ilike."*${term}*"`,
    );
  }

  const { data, error, count } = await idQuery.range(start, start + pageSize - 1);
  if (error) databaseFailure("Could not load products.");

  const ids = ((data || []) as Array<{ id: string }>).map((row) => row.id);
  const products = await loadCatalogRows(ids);
  return { products, total: count ?? products.length };
}

/* -------------------------------------------------------------------------- */
/* derived state kept in step with the variants                                */
/* -------------------------------------------------------------------------- */

/**
 * Roll every live variant's stock back into `product_shop_availability`.
 *
 * That table predates variants and is still what the storefront's "in stock at"
 * badge reads, so it is a SUM of the siblings and not a copy of whichever row
 * just changed — setting the 6M to zero must not report the whole product out
 * of stock when there are nine 3M on the shelf. This was inlined in
 * `adjustInventory`, where the only way to exercise it was to hit the API.
 *
 * Shops already carrying a row are always refreshed, not just the ones named:
 * archiving a product has to clear `is_available` everywhere it was sold.
 */
async function syncShopAvailability(productId: string, shopIds: string[] = []) {
  const [
    { data: productRow, error: productError },
    { data: variantRows, error: variantError },
    { data: existingRows, error: existingError },
  ] = await Promise.all([
    supabaseAdmin.from("products").select("is_active").eq("id", productId).maybeSingle(),
    supabaseAdmin.from("product_variants").select("id,is_active").eq("product_id", productId),
    supabaseAdmin
      .from("product_shop_availability")
      .select("shop_id")
      .eq("product_id", productId),
  ]);
  if (productError || variantError || existingError) {
    databaseFailure("Could not synchronize branch availability.");
  }

  const liveVariantIds = ((variantRows || []) as Array<{ id: string; is_active: boolean }>)
    .filter((variant) => variant.is_active)
    .map((variant) => variant.id);
  const { data: levelRows, error: levelError } = liveVariantIds.length
    ? await supabaseAdmin
        .from("inventory_levels")
        .select("shop_id,on_hand")
        .in("variant_id", liveVariantIds)
    : { data: [], error: null };
  if (levelError) databaseFailure("Could not synchronize branch availability.");

  const rolled = rollUpByShop(
    ((levelRows || []) as Array<{ shop_id: string; on_hand: number | string }>).map((level) => ({
      shopId: level.shop_id,
      onHand: Number(level.on_hand),
    })),
    { productIsActive: (productRow as { is_active?: boolean } | null)?.is_active !== false },
  );
  const byShop = new Map(rolled.map((entry) => [entry.shopId, entry]));

  const targets = [
    ...new Set([
      ...shopIds,
      ...((existingRows || []) as Array<{ shop_id: string }>).map((row) => row.shop_id),
      ...rolled.map((entry) => entry.shopId),
    ]),
  ];
  if (targets.length === 0) return;

  const { error } = await supabaseAdmin.from("product_shop_availability").upsert(
    targets.map((shopId) => {
      const entry = byShop.get(shopId);
      return {
        product_id: productId,
        shop_id: shopId,
        stock_quantity: entry?.onHand ?? 0,
        is_available: entry?.isAvailable ?? false,
      };
    }),
    { onConflict: "product_id,shop_id" },
  );
  if (error) databaseFailure("Could not synchronize branch availability.");
}

/**
 * `products.price` is a cache of the cheapest live variant, not an input.
 *
 * The listing grid, the counter and every query written before variants existed
 * read this column while the product page reads the variants. Recomputing it
 * after every write is what stops the two from drifting apart.
 */
async function syncProductFromPrice(productId: string, current: number) {
  const { data, error } = await supabaseAdmin
    .from("product_variants")
    .select("price,is_active")
    .eq("product_id", productId);
  if (error) databaseFailure("Could not update the product's price.");

  const next = fromPrice(
    ((data || []) as Array<{ price: number | string; is_active: boolean }>).map((row) => ({
      price: row.price,
      isActive: row.is_active,
    })),
    current,
  );
  if (next === current) return current;

  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({ price: next })
    .eq("id", productId);
  if (updateError) databaseFailure("Could not update the product's price.");
  return next;
}

/**
 * One select, before any write, so a collision reads as an instruction.
 *
 * The unique index stays the real guard — this is a check, not a lock, and two
 * admins saving at once still race past it — but a shop owner who reused a code
 * gets told WHICH code rather than "Could not save the product's versions."
 */
async function conflictingSkus(skus: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("product_variants")
    .select("sku")
    .in("sku", wanted);
  if (error) databaseFailure("Could not check the product codes.");
  return ((data || []) as Array<{ sku: string }>).map((row) => row.sku);
}

function inventoryRowsFor(
  stock: ReturnType<typeof expandStockPlan>,
  variantIdByKey: Map<string, string>,
) {
  return stock
    .map((row) => {
      const variantId = variantIdByKey.get(row.variantKey);
      if (!variantId) return null;
      return {
        variant_id: variantId,
        shop_id: row.shopId,
        on_hand: row.onHand,
        reorder_point: row.reorderPoint,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

/* -------------------------------------------------------------------------- */
/* writes                                                                      */
/* -------------------------------------------------------------------------- */

export async function createProduct(
  input: ProductCreateInput,
  actor: AdminActor,
) {
  const shopIds = input.availability.map((level) => level.shopId);
  await ensureActiveShops(shopIds);
  const sku = input.sku || makeSku();

  const options = input.options;
  const desired = desiredVariantsForCreate({
    options,
    variants: input.variants,
    price: input.price,
    sku,
    isActive: input.isActive,
  });
  const plan = planVariants([], desired, options, { skuBase: sku });
  if (plan.problems.length > 0) variantPlanFailure(plan.problems);

  const clashes = await conflictingSkus(plan.creates.map((variant) => variant.sku));
  if (clashes.length > 0) throw new AdminCatalogError(409, skuConflictMessage(clashes));

  // Everything is known before the first write, so `products.price` lands as the
  // "from" price on the insert instead of being corrected a moment later.
  const listPrice = fromPrice(
    plan.creates.map((variant) => ({ price: variant.price, isActive: variant.isActive })),
    input.price,
  );

  let productId: string | null = null;
  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .insert({
        name: input.name,
        description: input.description,
        category: input.category,
        age_range: input.ageRange,
        gender: input.gender,
        sku,
        price: listPrice,
        image_url: input.imageUrl || null,
        is_active: input.isActive,
        is_featured: input.isFeatured ?? false,
      })
      .select("id")
      .single();
    if (productError?.code === "23505") skuConflict(productError, [sku]);
    if (productError || !product) databaseFailure("Could not create product.");
    productId = product.id;
    const createdProductId = product.id as string;

    if (options.length > 0) await writeProductOptions(createdProductId, options);

    if (input.gallery?.length) {
      const { error: mediaError } = await supabaseAdmin.from("product_media").insert(
        input.gallery.map((url, index) => ({
          product_id: createdProductId,
          media_type: "image" as const,
          url,
          sort_order: index,
        })),
      );
      if (mediaError) databaseFailure("Could not save product gallery.");
    }

    const attempted = plan.creates.map((variant) => variant.sku);
    const { data: insertedVariants, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .insert(
        plan.creates.map((variant) => ({
          product_id: createdProductId,
          sku: variant.sku,
          title: variant.title,
          price: variant.price,
          compare_at_price: variant.compareAtPrice,
          cost_price: variant.costPrice,
          weight_grams: variant.weightGrams,
          option_values: variant.optionValues,
          is_default: variant.isDefault,
          is_active: variant.isActive,
        })),
      )
      .select("id,sku");
    if (variantError?.code === "23505") skuConflict(variantError, attempted);
    if (variantError || !insertedVariants) {
      databaseFailure("Could not save the product's versions.");
    }

    // Joined on SKU rather than on position: PostgREST makes no promise about
    // the order of a bulk insert's returning rows, and SKUs are unique.
    const idBySku = new Map(
      (insertedVariants as Array<{ id: string; sku: string }>).map((row) => [row.sku, row.id]),
    );
    const variantIdByKey = new Map<string, string>();
    for (const variant of plan.creates) {
      const id = idBySku.get(variant.sku);
      if (id) variantIdByKey.set(variant.signature, id);
    }

    // Keyed off the REQUEST rather than off `desired`: the row a simple product
    // gets synthesized carries no per-variant stock, and the product-level
    // allocation below is exactly what it should fall back to.
    const stockByKey = new Map<string, VariantInput["stock"]>();
    for (const row of input.variants) {
      stockByKey.set(declaredSignature(row.optionValues, options), row.stock);
    }
    const stock = expandStockPlan(
      plan.creates.map((variant) => ({
        key: variant.signature,
        stock: stockByKey.get(variant.signature),
      })),
      input.availability,
    );
    const inventoryRows = inventoryRowsFor(stock, variantIdByKey);
    if (inventoryRows.length > 0) {
      const { error: inventoryError } = await supabaseAdmin
        .from("inventory_levels")
        .insert(inventoryRows.map((row) => ({ ...row, reserved: 0 })));
      if (inventoryError) databaseFailure("Could not create product inventory.");
    }

    await syncShopAvailability(createdProductId, shopIds);

    const createdProduct = (await loadCatalogRows([createdProductId]))[0];
    await recordAudit(actor, "create", "products", createdProductId, null, {
      ...input,
      sku,
      price: listPrice,
    });
    return createdProduct;
  } catch (error) {
    if (productId) {
      // `product_variants`, `product_media` and `inventory_levels` all CASCADE
      // from `products`, so one delete takes N variants and N×M stock rows with
      // it. `product_shop_availability` is ON DELETE SET NULL, which is exactly
      // why it still has to go first and by hand.
      await supabaseAdmin
        .from("product_shop_availability")
        .delete()
        .eq("product_id", productId);
      await supabaseAdmin.from("products").delete().eq("id", productId);
    }
    throw error;
  }
}

/**
 * Replace a product's option list and variant grid in one call.
 *
 * PostgREST has no transactions, so the writes are ordered so that no failure
 * can make a live product disappear. Everything up to the last step is
 * ADDITIVE — new rows go in switched off, stock is upserted, the default moves
 * — and only then are removals applied. An abort part-way leaves invisible
 * orphans, which the next save reclaims by option signature rather than
 * duplicating (that is why identity is the signature and not the SKU).
 */
export async function replaceProductVariants(
  productId: string,
  input: ProductVariantsReplaceInput,
  actor: AdminActor,
) {
  const [product] = await fetchProductRows([productId]);
  if (!product) throw new AdminCatalogError(404, "Product not found.");

  const { data: existingData, error: existingError } = await supabaseAdmin
    .from("product_variants")
    .select(variantPlanningColumns)
    .eq("product_id", productId);
  if (existingError) databaseFailure("Could not load the product's versions.");
  const existingRows = (existingData || []) as unknown as VariantPlanningRow[];
  const existing: ExistingVariant[] = existingRows.map((row) => ({
    id: row.id,
    sku: row.sku,
    title: row.title,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    costPrice: row.cost_price,
    weightGrams: row.weight_grams,
    option_values: row.option_values,
    is_default: row.is_default,
    is_active: row.is_active,
  }));

  const options = input.options;
  if (input.variants.length === 0) {
    // `refineVariantGraph` only demands versions once options are declared, so
    // an empty grid on a simple product parses. Applying it would switch every
    // row off and leave a product nobody — including the till — can sell.
    throw new AdminCatalogError(
      400,
      "A product needs at least one version. Add one before saving.",
      { variants: "Add at least one version of this product." },
    );
  }

  const desired = carryForwardVariantFields(input.variants, existing, options);
  const plan = planVariants(existing, desired, options, {
    skuBase: product.sku || product.name,
  });
  if (plan.problems.length > 0) variantPlanFailure(plan.problems);

  const renamed = [...plan.updates, ...plan.reactivates]
    .map((update) => update.changes.sku)
    .filter((sku): sku is string => Boolean(sku));
  const ownSkus = new Set(existing.map((variant) => variant.sku));
  const clashes = (
    await conflictingSkus([...plan.creates.map((variant) => variant.sku), ...renamed])
  ).filter((sku) => !ownSkus.has(sku));
  if (clashes.length > 0) throw new AdminCatalogError(409, skuConflictMessage(clashes));

  const shopIds = [...new Set(input.availability.map((level) => level.shopId))];
  await ensureActiveShops([
    ...shopIds,
    ...input.variants.flatMap((variant) =>
      (variant.stock || []).map((level) => level.shopId),
    ),
  ]);

  // 1. New rows go in SWITCHED OFF and never as the default: the partial unique
  //    index `product_variants_one_default` forbids a second default, and an
  //    abort here must not put a half-configured version on the shop floor.
  const attempted = plan.creates.map((variant) => variant.sku);
  const variantIdBySignature = new Map<string, string>();
  for (const update of [...plan.updates, ...plan.reactivates]) {
    variantIdBySignature.set(update.signature, update.id);
  }
  // Rows the plan left untouched still need to be findable by signature so
  // their stock lands on them. Live-then-default order mirrors how the
  // reconciler picks between legacy twins, so both agree on which row is real.
  const bySignaturePreference = [...existingRows].sort((first, second) => {
    const live = Number(second.is_active) - Number(first.is_active);
    return live !== 0 ? live : Number(second.is_default) - Number(first.is_default);
  });
  for (const variant of bySignaturePreference) {
    const signature = declaredSignature(
      (variant.option_values || {}) as OptionSelection,
      options,
    );
    if (!variantIdBySignature.has(signature)) variantIdBySignature.set(signature, variant.id);
  }

  if (plan.creates.length > 0) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("product_variants")
      .insert(
        plan.creates.map((variant) => ({
          product_id: productId,
          sku: variant.sku,
          title: variant.title,
          price: variant.price,
          compare_at_price: variant.compareAtPrice,
          cost_price: variant.costPrice,
          weight_grams: variant.weightGrams,
          option_values: variant.optionValues,
          is_default: false,
          is_active: false,
        })),
      )
      .select("id,sku");
    if (insertError?.code === "23505") skuConflict(insertError, attempted);
    if (insertError || !inserted) databaseFailure("Could not add the new versions.");

    const idBySku = new Map(
      (inserted as Array<{ id: string; sku: string }>).map((row) => [row.sku, row.id]),
    );
    for (const variant of plan.creates) {
      const id = idBySku.get(variant.sku);
      if (id) variantIdBySignature.set(variant.signature, id);
    }
  }

  // 2. Stock, for every version that has a row to hang it on. Upserted, so a
  //    reclaimed orphan keeps the count the shop physically has.
  const stockSource = input.variants.map((variant) => ({
    key: declaredSignature(variant.optionValues, options),
    stock: variant.stock,
  }));
  const stock =
    shopIds.length > 0
      ? expandStockPlan(stockSource, input.availability)
      : // No shop list means "not resending the product's branches", so only the
        // numbers actually typed against a version are written. Filling in a
        // product-level default here would zero shops the caller never mentioned.
        stockSource.flatMap((variant) => expandStockPlan([variant], variant.stock || []));
  const inventoryRows = inventoryRowsFor(stock, variantIdBySignature);
  if (inventoryRows.length > 0) {
    const { error: inventoryError } = await supabaseAdmin
      .from("inventory_levels")
      .upsert(inventoryRows, { onConflict: "variant_id,shop_id" });
    if (inventoryError) databaseFailure("Could not update stock for these versions.");
  }

  // 3. Existing rows. `isDefault` and `isActive` are held back for the two
  //    dedicated steps below, which have an ordering the index cares about.
  for (const update of [...plan.updates, ...plan.reactivates]) {
    const changes = {
      ...(update.changes.sku !== undefined && { sku: update.changes.sku }),
      ...(update.changes.title !== undefined && { title: update.changes.title }),
      ...(update.changes.price !== undefined && { price: update.changes.price }),
      ...(update.changes.compareAtPrice !== undefined && {
        compare_at_price: update.changes.compareAtPrice,
      }),
      ...(update.changes.costPrice !== undefined && { cost_price: update.changes.costPrice }),
      ...(update.changes.weightGrams !== undefined && {
        weight_grams: update.changes.weightGrams,
      }),
      ...(update.changes.optionValues !== undefined && {
        option_values: update.changes.optionValues,
      }),
    };
    if (Object.keys(changes).length === 0) continue;
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update(changes)
      .eq("id", update.id);
    if (error?.code === "23505") skuConflict(error, [update.changes.sku || update.sku]);
    if (error) databaseFailure("Could not update the product's versions.");
  }

  // 4. Move the default. CLEAR FIRST: `product_variants_one_default` is a
  //    partial unique index, so two defaults for an instant is rejected while
  //    zero defaults for an instant is fine.
  const desiredDefaultId =
    plan.defaultId ?? variantIdBySignature.get(plan.defaultSignature) ?? null;
  const currentDefaultId = existing.find((variant) => variant.is_default)?.id ?? null;
  if (desiredDefaultId !== currentDefaultId) {
    if (currentDefaultId) {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .update({ is_default: false })
        .eq("product_id", productId)
        .eq("is_default", true);
      if (error) databaseFailure("Could not change which version is shown first.");
    }
    if (desiredDefaultId) {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .update({ is_default: true })
        .eq("id", desiredDefaultId);
      if (error) databaseFailure("Could not change which version is shown first.");
    }
  }

  // 5. Only now do the new and restored rows become sellable.
  const activateIds = [
    ...plan.creates
      .filter((variant) => variant.isActive)
      .map((variant) => variantIdBySignature.get(variant.signature))
      .filter((id): id is string => Boolean(id)),
    ...plan.reactivates.map((update) => update.id),
  ];
  if (activateIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update({ is_active: true })
      .in("id", activateIds);
    if (error) databaseFailure("Could not switch the new versions on.");
  }

  // 6. Removals last, and never deletions: purchase order and goods-received
  //    lines are ON DELETE RESTRICT, and deleting would take the shop's stock
  //    with it. Re-adding the combination reactivates this very row.
  const deactivateIds = plan.deactivates
    .filter((update) => update.changes.isActive === false)
    .map((update) => update.id);
  if (deactivateIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update({ is_active: false })
      .in("id", deactivateIds);
    if (error) databaseFailure("Could not switch the removed versions off.");
  }

  await writeProductOptions(productId, options);
  await syncProductFromPrice(productId, Number(product.price));
  await syncShopAvailability(productId, shopIds);

  const updated = (await loadCatalogRows([productId]))[0];
  await recordAudit(
    actor,
    "update",
    "products",
    productId,
    { options: product.options ?? null, variants: existing },
    { options, variants: input.variants },
  );
  return updated;
}

export async function patchProduct(
  productId: string,
  patch: ProductPatchInput,
  actor: AdminActor,
) {
  const [previous] = await fetchProductRows([productId]);
  if (!previous) throw new AdminCatalogError(404, "Product not found.");

  const { data: variantData, error: variantError } = await supabaseAdmin
    .from("product_variants")
    .select(variantColumns)
    .eq("product_id", productId);
  if (variantError) databaseFailure("Could not load the product's versions.");
  const previousVariants = (variantData || []) as unknown as VariantRow[];

  const options = resolveProductOptions(previous.options, previousVariants);
  const plan = planProductPatch(patch, {
    isVariable: options.length > 0,
    hasLiveVariant: previousVariants.some((variant) => variant.is_active),
  });
  if (plan.rejection) throw new AdminCatalogError(409, plan.rejection);

  const rollback = async () => {
    await supabaseAdmin
      .from("products")
      .update({
        name: previous.name,
        description: previous.description,
        category: previous.category,
        age_range: previous.age_range,
        gender: previous.gender,
        sku: previous.sku,
        price: previous.price,
        image_url: previous.image_url,
        is_active: previous.is_active,
        is_featured: previous.is_featured === true,
      })
      .eq("id", productId);
    for (const variant of previousVariants) {
      await supabaseAdmin
        .from("product_variants")
        .update({ sku: variant.sku, price: variant.price, is_active: variant.is_active })
        .eq("id", variant.id);
    }
  };

  if (patch.gallery !== undefined) {
    // Only the product's own strip: a variant's photo is keyed to the chip that
    // selects it and is not the gallery editor's to throw away.
    const { error: deleteMediaError } = await supabaseAdmin
      .from("product_media")
      .delete()
      .eq("product_id", productId)
      .is("variant_id", null);
    if (deleteMediaError) databaseFailure("Could not update product gallery.");
    if (patch.gallery.length > 0) {
      const { error: insertMediaError } = await supabaseAdmin.from("product_media").insert(
        patch.gallery.map((url, index) => ({
          product_id: productId,
          media_type: "image" as const,
          url,
          sort_order: index,
        })),
      );
      if (insertMediaError) databaseFailure("Could not update product gallery.");
    }
  }

  const productChanges = {
    ...(plan.product.name !== undefined && { name: plan.product.name }),
    ...(plan.product.description !== undefined && { description: plan.product.description }),
    ...(plan.product.category !== undefined && { category: plan.product.category }),
    ...(plan.product.ageRange !== undefined && { age_range: plan.product.ageRange }),
    ...(plan.product.gender !== undefined && { gender: plan.product.gender }),
    ...(plan.product.sku !== undefined && { sku: plan.product.sku }),
    ...(plan.product.price !== undefined && { price: plan.product.price }),
    ...(plan.product.imageUrl !== undefined && { image_url: plan.product.imageUrl || null }),
    ...(plan.product.isActive !== undefined && { is_active: plan.product.isActive }),
    ...(plan.product.isFeatured !== undefined && { is_featured: plan.product.isFeatured }),
  };
  if (Object.keys(productChanges).length > 0) {
    const { error: productError } = await supabaseAdmin
      .from("products")
      .update(productChanges)
      .eq("id", productId);
    if (productError?.code === "23505") skuConflict(productError, [patch.sku || ""]);
    if (productError) databaseFailure("Could not update product.");
  }

  // On a simple product the parent SKU and its only variant's SKU are the same
  // thing. On a variable one they are not: variant codes are generated per
  // combination and end up on printed shelf labels.
  if (Object.keys(plan.defaultVariant).length > 0) {
    const changes = {
      ...(plan.defaultVariant.sku !== undefined && { sku: plan.defaultVariant.sku }),
      ...(plan.defaultVariant.price !== undefined && { price: plan.defaultVariant.price }),
    };
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update(changes)
      .eq("product_id", productId)
      .eq("is_default", true);
    if (error) {
      await rollback();
      if (error.code === "23505") skuConflict(error, [plan.defaultVariant.sku || ""]);
      databaseFailure("Could not update the default product option.");
    }
  }

  // Almost always skipped: a product's archived state lives on
  // `products.is_active`, and `is_active` on a VARIANT is the seller's record
  // of "I removed this version". See the ACTIVE rule in `planProductPatch` —
  // this runs only to rescue a product archived by the code that wrote the flag
  // in both directions and left every version switched off.
  if (plan.variantsActive !== null && previousVariants.length > 0) {
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update({ is_active: plan.variantsActive })
      .eq("product_id", productId);
    if (error) {
      await rollback();
      databaseFailure("Could not update the product's versions.");
    }
  }

  try {
    await syncProductFromPrice(
      productId,
      Number(productChanges.price ?? previous.price),
    );
    await syncShopAvailability(productId);
  } catch (error) {
    await rollback();
    throw error;
  }

  await recordAudit(actor, "update", "products", productId, previous, patch);
  return (await loadCatalogRows([productId]))[0];
}

export async function archiveProduct(productId: string, actor: AdminActor) {
  await patchProduct(productId, { isActive: false }, actor);
}

/**
 * Hard delete — for products that should never have existed (test rows,
 * duplicates), not for retiring stock; retiring is `archiveProduct`.
 *
 * Refused whenever the product has trading history, and the two histories fail
 * differently: `order_items.product_id` is ON DELETE SET NULL, so a delete
 * would not error — it would quietly unlink every past sale from its product —
 * while procurement rows RESTRICT and would abort the cascade halfway through.
 * One pre-flight turns both into the same instruction: archive instead.
 */
export async function deleteProduct(productId: string, actor: AdminActor) {
  const [previous] = await fetchProductRows([productId]);
  if (!previous) throw new AdminCatalogError(404, "Product not found.");

  const { data: variantData, error: variantError } = await supabaseAdmin
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (variantError) databaseFailure("Could not check the product's history.");
  const variantIds = ((variantData || []) as Array<{ id: string }>).map((row) => row.id);

  const [orderRefs, purchaseRefs] = await Promise.all([
    supabaseAdmin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    variantIds.length
      ? supabaseAdmin
          .from("purchase_order_items")
          .select("id", { count: "exact", head: true })
          .in("variant_id", variantIds)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (orderRefs.error || purchaseRefs.error) {
    databaseFailure("Could not check the product's history.");
  }
  if ((orderRefs.count ?? 0) > 0 || (purchaseRefs.count ?? 0) > 0) {
    throw new AdminCatalogError(
      409,
      "This product has sales or purchase history and cannot be deleted. Archive it instead.",
    );
  }

  const { error } = await supabaseAdmin.from("products").delete().eq("id", productId);
  // 23503: something the pre-flight does not know about still points here
  // (a gift registry, a return line). Same advice either way.
  if (error?.code === "23503") {
    throw new AdminCatalogError(
      409,
      "This product is referenced by other records and cannot be deleted. Archive it instead.",
    );
  }
  if (error) databaseFailure("Could not delete the product.");

  await recordAudit(actor, "delete", "products", productId, previous, null);
}

export async function listInventory(input: {
  shopId?: string;
  productId?: string;
  lowStock?: boolean;
  limit: number;
}) {
  let variantQuery = supabaseAdmin.from("product_variants").select(variantColumns);
  if (input.productId) variantQuery = variantQuery.eq("product_id", input.productId);
  const { data: variantData, error: variantError } = await variantQuery;
  if (variantError) databaseFailure("Could not load inventory.");

  const variants = (variantData || []) as unknown as VariantRow[];
  const variantIds = variants.map((variant) => variant.id);
  if (variantIds.length === 0) return [];

  let inventoryQuery = supabaseAdmin
    .from("inventory_levels")
    .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
    .in("variant_id", variantIds)
    .order("updated_at", { ascending: false })
    .limit(input.limit);
  if (input.shopId) inventoryQuery = inventoryQuery.eq("shop_id", input.shopId);
  const { data: inventoryData, error: inventoryError } = await inventoryQuery;
  if (inventoryError) databaseFailure("Could not load inventory.");
  let inventory = (inventoryData || []) as unknown as InventoryRow[];
  if (input.lowStock) {
    inventory = inventory.filter(
      (level) => level.on_hand - level.reserved <= level.reorder_point,
    );
  }

  const productIds = [...new Set(variants.map((variant) => variant.product_id))];
  const shopIds = [...new Set(inventory.map((level) => level.shop_id))];
  const [
    { data: productData, error: productError },
    { data: shopData, error: shopError },
  ] = await Promise.all([
    supabaseAdmin.from("products").select("id,name,is_active").in("id", productIds),
    shopIds.length
      ? supabaseAdmin
          .from("shops")
          .select("id,name,location,is_active")
          .in("id", shopIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productError || shopError) databaseFailure("Could not load inventory details.");
  const products = (productData || []) as Array<{
    id: string;
    name: string;
    is_active: boolean;
  }>;
  const shops = (shopData || []) as unknown as ShopRow[];

  return inventory.map((level) => {
    const variant = variants.find((row) => row.id === level.variant_id)!;
    const product = products.find((row) => row.id === variant.product_id);
    const shop = shops.find((row) => row.id === level.shop_id);
    return {
      id: level.id,
      variantId: level.variant_id,
      productId: variant.product_id,
      productName: product?.name || "Product",
      sku: variant.sku,
      variantTitle: variant.title,
      shopId: level.shop_id,
      shopName: shop?.name || "Shop",
      shopLocation: shop?.location || "",
      onHand: level.on_hand,
      reserved: level.reserved,
      available: level.on_hand - level.reserved,
      reorderPoint: level.reorder_point,
      lowStock: level.on_hand - level.reserved <= level.reorder_point,
      updatedAt: level.updated_at,
    };
  });
}

export async function adjustInventory(
  variantId: string,
  shopId: string,
  input: InventoryAdjustmentInput,
  actor: AdminActor,
) {
  const [{ data: variantData, error: variantError }, { data: shopData, error: shopError }] =
    await Promise.all([
      supabaseAdmin
        .from("product_variants")
        .select("id,product_id,sku,title,is_active")
        .eq("id", variantId)
        .maybeSingle(),
      supabaseAdmin
        .from("shops")
        .select("id,name,location,is_active")
        .eq("id", shopId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
  if (variantError || shopError) databaseFailure("Could not validate inventory target.");
  if (!variantData || !shopData) {
    throw new AdminCatalogError(404, "Product option or shop not found.");
  }

  const { data: previousData, error: previousError } = await supabaseAdmin
    .from("inventory_levels")
    .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
    .eq("variant_id", variantId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (previousError) databaseFailure("Could not load inventory level.");
  const previous = previousData as InventoryRow | null;
  if (previous && input.onHand < previous.reserved) {
    throw new AdminCatalogError(
      409,
      `On-hand stock cannot be lower than ${previous.reserved} reserved units.`,
    );
  }

  const { data: level, error: levelError } = await supabaseAdmin
    .from("inventory_levels")
    .upsert(
      {
        variant_id: variantId,
        shop_id: shopId,
        on_hand: input.onHand,
        reserved: previous?.reserved || 0,
        reorder_point: input.reorderPoint ?? previous?.reorder_point ?? 0,
      },
      { onConflict: "variant_id,shop_id" },
    )
    .select("id,variant_id,shop_id,on_hand,reserved,reorder_point,updated_at")
    .single();
  if (levelError || !level) databaseFailure("Could not update inventory.");

  try {
    await syncShopAvailability(variantData.product_id, [shopId]);
  } catch (error) {
    if (previous) {
      await supabaseAdmin
        .from("inventory_levels")
        .upsert(previous, { onConflict: "variant_id,shop_id" });
    } else {
      await supabaseAdmin
        .from("inventory_levels")
        .delete()
        .eq("variant_id", variantId)
        .eq("shop_id", shopId);
    }
    throw error;
  }

  await recordAudit(
    actor,
    "adjust_stock",
    "inventory_levels",
    level.id,
    previous,
    level,
  );
  return {
    id: level.id,
    variantId,
    productId: variantData.product_id,
    shopId,
    onHand: level.on_hand,
    reserved: level.reserved,
    available: level.on_hand - level.reserved,
    reorderPoint: level.reorder_point,
    updatedAt: level.updated_at,
  };
}
