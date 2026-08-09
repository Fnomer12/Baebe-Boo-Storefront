import "server-only";

import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { conflict, databaseFailure, notFound, unavailable } from "./errors";

export type CounterHandoverLine = {
  id: string;
  productName: string;
  quantity: number;
};

export type CounterHandoverOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: string;
  placedAt: string;
  lines: CounterHandoverLine[];
};

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  total_amount: number | string | null;
  order_status: string | null;
  created_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_name: string | null;
  quantity: number | string | null;
};

type AllocationRow = {
  order_id: string;
  fulfilment_type: string | null;
  status: string | null;
};

const ORDER_COLUMNS =
  "id, order_number, customer_name, customer_phone, delivery_address, total_amount, order_status, created_at";

/** Statuses an order can be in while it waits on the shelf for its customer. */
const AWAITING_COLLECTION = ["received", "processing", "on_hold"] as const;

const CLICK_AND_COLLECT_ADDRESS = "Click-and-collect";

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string };
  return row.code === "PGRST205" || row.code === "42P01";
}

function toNumber(value: number | string | null | undefined) {
  return Number(value || 0);
}

function requireAdminClient() {
  if (!isSupabaseAdminConfigured) {
    unavailable("The counter is not configured for this deployment.");
  }
}

async function loadOrderLines(orderIds: readonly string[]) {
  const lines = new Map<string, CounterHandoverLine[]>();
  if (orderIds.length === 0) return lines;

  const { data, error } = await supabaseAdmin
    .from("order_items")
    .select("id, order_id, product_name, quantity")
    .in("order_id", [...orderIds]);
  if (error) databaseFailure("Order contents could not be loaded.");

  for (const item of (data || []) as unknown as OrderItemRow[]) {
    const line: CounterHandoverLine = {
      id: item.id,
      productName: item.product_name || "Product",
      quantity: toNumber(item.quantity),
    };
    lines.set(item.order_id, [...(lines.get(item.order_id) || []), line]);
  }
  return lines;
}

/**
 * Decide which of this shop's paid online orders are actually pickups.
 *
 * `fulfilment_allocations` is authoritative when present. Orders placed before
 * that table existed are recognised by the delivery-address sentinel the
 * checkout writes. An order with an allocation that says "delivery" is
 * excluded even if the sentinel matches.
 */
async function pickupOrderIds(shopId: string, orderIds: readonly string[]) {
  if (orderIds.length === 0) return { byAllocation: new Map<string, boolean>() };

  const { data, error } = await supabaseAdmin
    .from("fulfilment_allocations")
    .select("order_id, fulfilment_type, status")
    .eq("shop_id", shopId)
    .in("order_id", [...orderIds]);

  if (error && !isMissingRelationError(error)) {
    databaseFailure("Collection orders could not be loaded.");
  }

  const byAllocation = new Map<string, boolean>();
  for (const row of (data || []) as unknown as AllocationRow[]) {
    if (row.status === "cancelled") continue;
    const isPickup = row.fulfilment_type === "pickup";
    byAllocation.set(row.order_id, (byAllocation.get(row.order_id) ?? false) || isPickup);
  }
  return { byAllocation };
}

export async function listCounterHandoverOrders(
  shopId: string,
): Promise<CounterHandoverOrder[]> {
  requireAdminClient();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("shop_id", shopId)
    .eq("payment_status", "paid")
    .in("order_status", [...AWAITING_COLLECTION])
    .neq("order_type", "instore")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) databaseFailure("Collection orders could not be loaded.");

  const rows = (data || []) as unknown as OrderRow[];
  const { byAllocation } = await pickupOrderIds(
    shopId,
    rows.map((row) => row.id),
  );

  const pickups = rows.filter((row) => {
    const allocation = byAllocation.get(row.id);
    if (allocation !== undefined) return allocation;
    return row.delivery_address === CLICK_AND_COLLECT_ADDRESS;
  });

  const lines = await loadOrderLines(pickups.map((row) => row.id));

  return pickups.map((row) => ({
    id: row.id,
    orderNumber: row.order_number || "",
    customerName: row.customer_name || "Customer",
    customerPhone: row.customer_phone || "",
    total: toNumber(row.total_amount),
    status: row.order_status || "received",
    placedAt: row.created_at || "",
    lines: lines.get(row.id) || [],
  }));
}

export async function getCounterHandoverOrder(
  shopId: string,
  orderId: string,
): Promise<CounterHandoverOrder> {
  requireAdminClient();

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) databaseFailure("The order could not be loaded.");
  if (!data) notFound("Order not found.");

  const row = data as unknown as OrderRow;
  const lines = await loadOrderLines([row.id]);

  return {
    id: row.id,
    orderNumber: row.order_number || "",
    customerName: row.customer_name || "Customer",
    customerPhone: row.customer_phone || "",
    total: toNumber(row.total_amount),
    status: row.order_status || "received",
    placedAt: row.created_at || "",
    lines: lines.get(row.id) || [],
  };
}

/**
 * Hand a collection order to its customer.
 *
 * Uses the cookie-scoped client for the same reason `recordCounterSale` does:
 * `collect_counter_order` re-derives the caller's shop from the JWT, and the
 * service role would skip that check.
 */
export async function collectCounterOrder(shopId: string, orderId: string) {
  // Fails with 404 before the write if the order is not this shop's.
  await getCounterHandoverOrder(shopId, orderId);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("collect_counter_order", {
    p_order_id: orderId,
  });

  if (error) {
    if (error.code === "PGRST202") {
      conflict(
        "The collection function is missing on this database. Apply the latest migration.",
      );
    }
    conflict(error.message || "The order could not be handed over.");
  }

  return getCounterHandoverOrder(shopId, orderId);
}
