import "server-only";

import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffCustomerEmail } from "@/lib/auth/staff-customers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { completeCounterSale } from "@/domain/counter/sale";
import { quoteCheckoutPromotions } from "@/lib/checkout/promotions";
import { calculateEarnedPoints, parsePurchaseEarnConfig, tierForLifetimePoints } from "@/domain/commerce/rewards";
import type { CounterSaleCreateInput } from "./counter-schemas";
import { conflict, databaseFailure, notFound, unavailable } from "./errors";

export type CounterSaleSummary = {
  id: string;
  orderNumber: string;
  customerName: string;
  paymentMethod: string;
  total: number;
  soldAt: string;
  isMine: boolean;
};

export type CounterSaleReceiptLine = {
  id: string;
  productName: string;
  /** e.g. "Blue · 3M". Never empty — falls back to variant title, then SKU. */
  variantLabel: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

export type CounterSaleReceipt = CounterSaleSummary & {
  customerPhone: string;
  lines: CounterSaleReceiptLine[];
};

export type CounterSalesDigest = {
  sales: CounterSaleSummary[];
  todayTotal: number;
  todayCount: number;
  myTodayTotal: number;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string | null;
  total_amount: number | string | null;
  created_at: string | null;
  staff_id: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_name: string | null;
  variant_id: string | null;
  quantity: number | string | null;
  price: number | string | null;
};

type VariantRow = {
  id: string;
  title: string | null;
  option_values: unknown;
  sku: string | null;
};

const ORDER_COLUMNS =
  "id, order_number, customer_name, customer_phone, payment_method, total_amount, created_at, staff_id";

function toNumber(value: number | string | null | undefined) {
  return Number(value || 0);
}

function requireAdminClient() {
  if (!isSupabaseAdminConfigured) {
    unavailable("The counter is not configured for this deployment.");
  }
}

function startOfTodayMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Compared as instants, not as strings. PostgREST renders a timestamptz with a
 * `+00:00` offset while `Date#toISOString` emits `.000Z`, and those two formats
 * do not order correctly under lexicographic comparison.
 */
function soldOnOrAfter(soldAt: string, thresholdMs: number) {
  const at = Date.parse(soldAt);
  return Number.isFinite(at) && at >= thresholdMs;
}

/**
 * Short human label for one sold version, mirroring the till's own
 * `variantLabel`: structured option values first ("Blue · 3M"), then the
 * authored title, then the SKU. Never empty.
 */
function describeVariant(variant: VariantRow | undefined): string {
  if (!variant) return "";
  const order = ["color", "colour", "size", "material"];
  const rank = (key: string) => {
    const index = order.indexOf(key.toLowerCase());
    return index === -1 ? order.length : index;
  };
  const entries = Object.entries((variant.option_values || {}) as Record<string, unknown>)
    .map(([key, value]) => [key, String(value ?? "").trim()] as const)
    .filter(([, value]) => value.length > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  if (entries.length > 0) return entries.map(([, value]) => value).join(" · ");
  if (variant.title && variant.title !== "Default") return variant.title;
  return variant.sku || "";
}

function toSummary(row: OrderRow, staffId: string): CounterSaleSummary {  return {
    id: row.id,
    orderNumber: row.order_number || "",
    customerName: row.customer_name || "Walk-in Customer",
    paymentMethod: row.payment_method || "cash",
    total: toNumber(row.total_amount),
    soldAt: row.created_at || "",
    isMine: row.staff_id === staffId,
  };
}

/**
 * In-store sales for one shop.
 *
 * Reads use the service role because `orders` is `is_admin()`-only for the
 * `authenticated` role (20260721_production_security.sql), so a cashier's own
 * session cannot select its own shop's sales. `shopId` is a query filter, not
 * a post-filter, so an unscoped read is not expressible here.
 */
export async function listCounterSales(
  shopId: string,
  staffId: string,
  options: { limit?: number } = {},
): Promise<CounterSalesDigest> {
  requireAdminClient();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("shop_id", shopId)
    .eq("order_type", "instore")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (error) databaseFailure("Sales could not be loaded.");

  const rows = (data || []) as unknown as OrderRow[];
  const sales = rows.map((row) => toSummary(row, staffId));

  const today = startOfTodayMs();
  const todaySales = sales.filter((sale) => soldOnOrAfter(sale.soldAt, today));

  return {
    sales,
    todayCount: todaySales.length,
    todayTotal: Math.round(todaySales.reduce((sum, sale) => sum + sale.total, 0) * 100) / 100,
    myTodayTotal:
      Math.round(
        todaySales.filter((sale) => sale.isMine).reduce((sum, sale) => sum + sale.total, 0) * 100,
      ) / 100,
  };
}

export async function getCounterSaleReceipt(
  shopId: string,
  staffId: string,
  orderId: string,
): Promise<CounterSaleReceipt> {
  requireAdminClient();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) databaseFailure("The receipt could not be loaded.");
  if (!data) notFound("Sale not found.");

  const row = data as unknown as OrderRow;

  const { data: itemData, error: itemError } = await supabaseAdmin
    .from("order_items")
    .select("id, order_id, product_name, variant_id, quantity, price")
    .eq("order_id", orderId);
  if (itemError) databaseFailure("The receipt could not be loaded.");

  const items = ((itemData || []) as unknown as OrderItemRow[]);
  // Variant detail for the receipt: without it two versions of one product
  // ("Blue · 3M" vs "Pink · 6M") print as the same line and exchanges become
  // guesswork. Missing rows degrade to the product name, never an error.
  const variantIds = [...new Set(items.map((item) => item.variant_id).filter((id): id is string => Boolean(id)))];
  let variantsById = new Map<string, VariantRow>();
  if (variantIds.length > 0) {
    const { data: variantData } = await supabaseAdmin
      .from("product_variants")
      .select("id, title, option_values, sku")
      .in("id", variantIds);
    variantsById = new Map(((variantData || []) as unknown as VariantRow[]).map((variant) => [String(variant.id), variant]));
  }

  const lines = items.map((item) => {
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.price);
    return {
      id: item.id,
      productName: item.product_name || "Product",
      variantLabel: item.variant_id ? describeVariant(variantsById.get(item.variant_id)) : "",
      quantity,
      price,
      lineTotal: Math.round(quantity * price * 100) / 100,
    };
  });

  return {
    ...toSummary(row, staffId),
    customerPhone: row.customer_phone || "",
    lines,
  };
}

/**
 * Load an in-store receipt after its signed QR link has been verified.
 *
 * This intentionally accepts only the order number and keeps the query scoped
 * to in-store orders. The caller must verify the QR token before calling it.
 */
export async function getPublicCounterSaleReceipt(orderNumber: string): Promise<CounterSaleReceipt> {
  requireAdminClient();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`${ORDER_COLUMNS}, shop_id`)
    .eq("order_number", orderNumber)
    .eq("order_type", "instore")
    .maybeSingle();
  if (error) databaseFailure("The digital receipt could not be loaded.");
  if (!data) notFound("Digital receipt not found.");

  const row = data as unknown as OrderRow & { shop_id: string };
  return getCounterSaleReceipt(row.shop_id, "", row.id);
}

/**
 * Ring up a sale.
 *
 * Unlike the reads above this uses the **cookie-scoped** client on purpose.
 * `complete_counter_sale` re-derives the shop from the caller's JWT whenever
 * the caller is not `service_role`; going through the service role would
 * disarm that second gate and leave the shop scoping resting entirely on this
 * process. Passing the session through keeps the database's own check live.
 */
export async function recordCounterSale(
  shopId: string,
  staffId: string,
  input: CounterSaleCreateInput,
) {
  const supabase = await createServerSupabaseClient();

  const { sale, error } = await completeCounterSale(supabase, {
    staffId,
    items: input.items,
    paymentMethod: input.paymentMethod,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  if (error) {
    // PGRST202 means PostgREST could not find a function with these arguments,
    // which in practice means 20260728_counter_sale_integrity.sql has not been
    // applied yet. Say so rather than reporting a generic sale failure.
    if (error.code === "PGRST202") {
      conflict(
        "The counter sale function is out of date on this database. Apply the latest migration.",
      );
    }
    // `order_items.unit_price` and `total_price` are NOT NULL with no default,
    // and `complete_counter_sale` only ever supplied the newer `price` /
    // `cost_price` columns — so EVERY counter sale failed, and the cashier saw
    // a raw Postgres constraint message. Translate it while the fix
    // (20260807_counter_sale_order_item_columns.sql) is still unapplied.
    if (/unit_price|total_price/.test(error.message || "")) {
      conflict(
        "This till cannot record sales until the database is updated. " +
          "Apply 20260807_counter_sale_order_item_columns.sql, then try again.",
      );
    }
    conflict(error.message || "The sale could not be completed.");
  }
  if (!sale) conflict("The sale could not be completed.");

  // Post-sale enrichment never fails the sale: money already changed hands.
  // Each step is best-effort and logs rather than throws.
  await linkCounterCustomer(sale.orderId, input.customerUserId);
  await applyCounterPromotions(sale.orderId);
  await earnCounterLoyalty(sale.orderId, input.customerUserId);

  return getCounterSaleReceipt(shopId, staffId, sale.orderId);
}

/**
 * Staff accounts must never own orders or loyalty: the bootstrap trigger
 * gives every till login a customer_profiles row, so an explicit check is
 * the only thing stopping a sale from being attached to a cashier.
 * Best-effort and fail-closed: on lookup failure the link is skipped rather
 * than risk crediting a staff account.
 */
async function isStaffAccount(userId: string): Promise<boolean> {
  try {
    const [{ data: staff }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("shop_staff").select("id").eq("auth_user_id", userId).limit(1),
      supabaseAdmin.from("customer_profiles").select("email").eq("user_id", userId).maybeSingle(),
    ]);
    if (staff && staff.length > 0) return true;
    return isStaffCustomerEmail((profile as { email?: string | null } | null)?.email);
  } catch {
    return true;
  }
}

/**
 * Attach an account holder to a till sale so order history + loyalty follow
 * them. Only ever from the member lookup (a UUID), never free text.
 */
async function linkCounterCustomer(orderId: string, customerUserId?: string | null) {
  if (!customerUserId) return;
  try {
    if (await isStaffAccount(customerUserId)) return;
    const { data: profile } = await supabaseAdmin
      .from("customer_profiles")
      .select("user_id")
      .eq("user_id", customerUserId)
      .maybeSingle();
    if (!profile) return;
    await supabaseAdmin.from("orders").update({ customer_user_id: customerUserId }).eq("id", orderId);
  } catch (error) {
    console.error("counter sale: customer link failed", { orderId, error });
  }
}

/**
 * Automatic till promos, applied silently (the till has no code box).
 *
 * Reuses the online quote engine with `channel: "counter"` so category
 * pro-rating, minimums, limits and stackability behave identically on both
 * channels. The discount comes off `orders.total_amount` and is audited in
 * `applied_promotions` for the existing redemption finalizer to consume.
 */
async function applyCounterPromotions(orderId: string) {
  try {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount, customer_user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_id, variant_id, quantity, price")
      .eq("order_id", orderId);
    if (!items || items.length === 0) return;
    const productIds = [...new Set(items.map((item) => String(item.product_id)).filter(Boolean))];
    let categoryByProduct = new Map<string, string | null>();
    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin.from("products").select("id, category").in("id", productIds);
      categoryByProduct = new Map((products || []).map((product) => [String(product.id), (product.category as string | null) || null]));
    }
    const quote = await quoteCheckoutPromotions({
      lines: items.map((item) => ({
        variantId: String(item.variant_id || item.product_id),
        productId: String(item.product_id),
        category: categoryByProduct.get(String(item.product_id)) || null,
        unitPrice: Number(item.price),
        quantity: Number(item.quantity),
      })),
      productIds,
      productCategories: Object.fromEntries(categoryByProduct),
      deliveryFee: 0,
      channel: "counter",
      customerUserId: (order as { customer_user_id?: string | null }).customer_user_id || null,
    });
    if (quote.discount <= 0 || quote.appliedPromotions.length === 0) return;
    const total = Math.max(0, Math.round((Number(order.total_amount) - quote.discount) * 100) / 100);
    await supabaseAdmin.from("orders").update({ total_amount: total }).eq("id", orderId);
    let remaining = quote.discount;
    await supabaseAdmin.from("applied_promotions").insert(
      quote.appliedPromotions.map((promotion, index) => {
        // Remainder-to-last-entry split, mirroring the online path: every
        // entry except the last claims an even share, the last takes whatever
        // is left so rounding never strands a pesewa.
        const share =
          index === quote.appliedPromotions.length - 1
            ? remaining
            : Math.round((quote.discount / quote.appliedPromotions.length) * 100) / 100;
        remaining = Math.max(0, Math.round((remaining - share) * 100) / 100);
        return {
          order_id: orderId,
          promotion_id: promotion.promotionId,
          code: promotion.code,
          promotion_snapshot: {
            name: promotion.name,
            kind: promotion.kind,
            value: promotion.value,
            stackable: promotion.stackable,
            channel: "counter",
            eligible_subtotal: promotion.eligibleSubtotal ?? null,
          },
          discount_amount: share,
        };
      }),
    );
    await supabaseAdmin.rpc("record_order_promotion_redemptions", { p_order_id: orderId });
  } catch (error) {
    console.error("counter sale: promotion apply failed", { orderId, error });
  }
}

/**
 * Till loyalty earn: account holders only, per the purchase rule's
 * `earn_at_counter` flag. Uses the same rate × tier × category math as online
 * (online earn path reads the same rule config at finalize time).
 */
async function earnCounterLoyalty(orderId: string, customerUserId?: string | null) {
  if (!customerUserId) return;
  if (await isStaffAccount(customerUserId)) return;
  try {
    const { data: rule } = await supabaseAdmin
      .from("loyalty_rules")
      .select("points, is_active, earn_at_counter, config")
      .eq("event_type", "purchase")
      .maybeSingle();
    if (!rule || rule.is_active === false || rule.earn_at_counter !== true) return;
    const config = parsePurchaseEarnConfig((rule as { config?: unknown }).config);
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const merchandise = Number(order.total_amount);
    if (!Number.isFinite(merchandise) || merchandise < config.minimumOrderAmount || merchandise <= 0) return;
    let multiplier = 1;
    try {
      const [{ data: account }, { data: tiers }] = await Promise.all([
        supabaseAdmin.from("reward_accounts").select("lifetime_points").eq("user_id", customerUserId).maybeSingle(),
        supabaseAdmin.from("loyalty_tiers").select("id, name, min_lifetime_points, earn_multiplier, is_active"),
      ]);
      if (tiers) {
        const tier = tierForLifetimePoints(
          tiers.map((entry) => ({
            id: String(entry.id),
            name: String(entry.name),
            minLifetimePoints: Number(entry.min_lifetime_points),
            earnMultiplier: Number(entry.earn_multiplier),
            isActive: entry.is_active !== false,
          })),
          Number(account?.lifetime_points || 0),
        );
        if (tier) multiplier = tier.earnMultiplier;
      }
    } catch {
      // Tier lookup is decoration; earn at 1x rather than not at all.
    }
    const points = calculateEarnedPoints(merchandise, { pointsPerCedi: config.pointsPerCedi, multiplier });
    if (points <= 0) return;
    await supabaseAdmin.rpc("credit_loyalty_points", {
      p_user_id: customerUserId,
      p_event_type: "purchase",
      p_source_key: `order:${orderId}:purchase`,
      p_reason: `Till purchase reward (${multiplier}x tier)`,
      p_order_id: orderId,
      p_metadata: { channel: "counter", multiplier, rate: config.pointsPerCedi },
    });
  } catch (error) {
    console.error("counter sale: loyalty earn failed", { orderId, error });
  }
}
