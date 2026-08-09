import "server-only";

import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { completeCounterSale } from "@/domain/counter/sale";
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
  quantity: number | string | null;
  price: number | string | null;
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

function toSummary(row: OrderRow, staffId: string): CounterSaleSummary {
  return {
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
    .select("id, order_id, product_name, quantity, price")
    .eq("order_id", orderId);
  if (itemError) databaseFailure("The receipt could not be loaded.");

  const lines = ((itemData || []) as unknown as OrderItemRow[]).map((item) => {
    const quantity = toNumber(item.quantity);
    const price = toNumber(item.price);
    return {
      id: item.id,
      productName: item.product_name || "Product",
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

  return getCounterSaleReceipt(shopId, staffId, sale.orderId);
}
