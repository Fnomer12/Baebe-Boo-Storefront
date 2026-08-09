import "server-only";

import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import type { CounterCatalogItem } from "@/domain/counter/catalog";
import { availableStock } from "@/domain/counter/stock";
import { databaseFailure, unavailable } from "./errors";

type InventoryRow = {
  variant_id: string;
  on_hand: number | string | null;
  reserved: number | string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku: string | null;
  title: string | null;
  option_values: Record<string, unknown> | null;
  price: number | string | null;
  is_active: boolean | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  category: string | null;
  age_range: string | null;
  gender: string | null;
  sku: string | null;
  price: number | string | null;
  image_url: string | null;
  is_active: boolean | null;
};

type LegacyAvailabilityRow = {
  product_id: string;
  stock_quantity: number | string | null;
  is_available: boolean | null;
};

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string };
  return row.code === "PGRST205" || row.code === "42P01";
}

function toNumber(value: number | string | null | undefined) {
  return Number(value || 0);
}

/**
 * `product_variants.option_values` is jsonb, so anything could be in there.
 * Coerce to a flat string map and drop blanks — the till renders these as
 * chips and a chip reading "null" is worse than no chip.
 */
function toOptionValues(raw: Record<string, unknown> | null | undefined) {
  const values: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return values;
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) values[key.toLowerCase()] = text;
  }
  return values;
}

/**
 * "Default Title" is what createProduct writes for a product with no options.
 * It is a placeholder, not a label, and showing it on a card is noise.
 */
function toVariantTitle(title: string | null | undefined, siblingCount: number) {
  if (siblingCount <= 1) return null;
  const trimmed = (title || "").trim();
  if (!trimmed || trimmed === "Default Title") return null;
  return trimmed;
}

/**
 * Read everything this shop stocks.
 *
 * Reads go through `supabaseAdmin` rather than the caller's session because
 * `inventory_levels` is revoked from `authenticated` with no re-grant — a
 * browser session cannot read it at all. The shop scoping that replaces the
 * revoked RLS is the `shopId` filter applied to every query below.
 */
async function loadShopInventory(shopId: string): Promise<CounterCatalogItem[]> {
  if (!isSupabaseAdminConfigured) {
    unavailable("The counter is not configured for this deployment.");
  }

  const inventory = await supabaseAdmin
    .from("inventory_levels")
    .select("variant_id, on_hand, reserved")
    .eq("shop_id", shopId);

  if (inventory.error && !isMissingRelationError(inventory.error)) {
    databaseFailure("Shop stock could not be loaded.");
  }

  const inventoryRows = (inventory.data || []) as unknown as InventoryRow[];
  const items: CounterCatalogItem[] = [];
  const productIdsWithVariants = new Set<string>();

  if (inventoryRows.length > 0) {
    const variantIds = Array.from(new Set(inventoryRows.map((row) => row.variant_id)));
    // `title` and `option_values` have been on this table since it was created
    // and were never selected here, which is the whole reason a four-size
    // hoodie reached the till as four identical cards.
    const { data: variantData, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .select("id, product_id, sku, title, option_values, price, is_active")
      .in("id", variantIds)
      .eq("is_active", true);
    if (variantError) databaseFailure("Shop stock could not be loaded.");

    const variants = (variantData || []) as unknown as VariantRow[];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const productIds = Array.from(new Set(variants.map((variant) => variant.product_id)));

    // How many versions of each product this shop actually stocks. A product
    // with six versions company-wide but one on this shelf needs no label.
    const siblingCount = new Map<string, number>();
    for (const row of inventoryRows) {
      const variant = variantById.get(row.variant_id);
      if (!variant) continue;
      siblingCount.set(variant.product_id, (siblingCount.get(variant.product_id) || 0) + 1);
    }

    const products = await loadProducts(productIds);

    for (const row of inventoryRows) {
      const variant = variantById.get(row.variant_id);
      if (!variant) continue;
      const product = products.get(variant.product_id);
      if (!product) continue;

      productIdsWithVariants.add(product.id);
      items.push({
        productId: product.id,
        variantId: variant.id,
        name: product.name || "Unnamed product",
        category: product.category || "Uncategorized",
        ageRange: product.age_range || "",
        gender: product.gender || "",
        sku: variant.sku || product.sku || "NO-SKU",
        price: toNumber(variant.price ?? product.price),
        imageUrl: product.image_url || "",
        onHand: toNumber(row.on_hand),
        reserved: toNumber(row.reserved),
        variantTitle: toVariantTitle(variant.title, siblingCount.get(product.id) || 1),
        optionValues: toOptionValues(variant.option_values),
      });
    }
  }

  // Legacy deployments have no product_variants rows. Those products are shown
  // so the shelf is honest about what is in the shop, but they carry no
  // variantId and therefore cannot be sold — complete_counter_sale sells by
  // variant. Deduped by product: if a product has any inventory_levels row,
  // its legacy row would double-count it.
  const legacy = await supabaseAdmin
    .from("product_shop_availability")
    .select("product_id, stock_quantity, is_available")
    .eq("shop_id", shopId);

  if (legacy.error && !isMissingRelationError(legacy.error)) {
    databaseFailure("Shop stock could not be loaded.");
  }

  const legacyCandidates = ((legacy.data || []) as unknown as LegacyAvailabilityRow[]).filter(
    (row) => !productIdsWithVariants.has(row.product_id),
  );

  if (legacyCandidates.length > 0) {
    // Exclude anything that has a variant ANYWHERE, not merely one stocked
    // here. The previous filter only knew about variants with an
    // `inventory_levels` row at this shop, so a product carried at Alpha and
    // not at Beta surfaced at Beta as a legacy row — an unsellable phantom
    // card for stock the shop does not have.
    const { data: variantProbe, error: probeError } = await supabaseAdmin
      .from("product_variants")
      .select("product_id")
      .in("product_id", legacyCandidates.map((row) => row.product_id))
      .eq("is_active", true);

    if (probeError && !isMissingRelationError(probeError)) {
      databaseFailure("Shop stock could not be loaded.");
    }

    const hasVariants = new Set(
      ((variantProbe || []) as unknown as Array<{ product_id: string }>).map(
        (row) => row.product_id,
      ),
    );
    const legacyRows = legacyCandidates.filter((row) => !hasVariants.has(row.product_id));

    const products = await loadProducts(legacyRows.map((row) => row.product_id));
    for (const row of legacyRows) {
      const product = products.get(row.product_id);
      if (!product) continue;
      items.push({
        productId: product.id,
        variantId: null,
        name: product.name || "Unnamed product",
        category: product.category || "Uncategorized",
        ageRange: product.age_range || "",
        gender: product.gender || "",
        sku: product.sku || "NO-SKU",
        price: toNumber(product.price),
        imageUrl: product.image_url || "",
        onHand: row.is_available === false ? 0 : toNumber(row.stock_quantity),
        reserved: 0,
        variantTitle: null,
        optionValues: {},
      });
    }
  }

  return items.sort((first, second) => first.name.localeCompare(second.name));
}

async function loadProducts(productIds: readonly string[]) {
  const unique = Array.from(new Set(productIds));
  if (unique.length === 0) return new Map<string, ProductRow>();

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, category, age_range, gender, sku, price, image_url, is_active")
    .in("id", unique)
    .eq("is_active", true);
  if (error) databaseFailure("Shop products could not be loaded.");

  const rows = (data || []) as unknown as ProductRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

/** Everything the till can actually ring up right now. */
export async function listCounterCatalog(shopId: string): Promise<CounterCatalogItem[]> {
  const items = await loadShopInventory(shopId);
  return items.filter((item) => availableStock(item) > 0);
}

/** Everything the shop carries, including the empty shelves. */
export async function listCounterStock(shopId: string): Promise<CounterCatalogItem[]> {
  return loadShopInventory(shopId);
}
