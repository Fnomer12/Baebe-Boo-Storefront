import type { SupabaseClient } from "@supabase/supabase-js";
import type { CounterPaymentMethod } from "./catalog";

export type CounterSaleItemInput = {
  variantId: string;
  quantity: number;
};

export type CounterSaleInput = {
  staffId: string;
  items: readonly CounterSaleItemInput[];
  paymentMethod: CounterPaymentMethod;
  customerName?: string;
  customerPhone?: string;
  customerUserId?: string | null;
  idempotencyKey?: string | null;
};

/**
 * Collapse duplicate variants and drop non-positive quantities.
 *
 * The RPC groups by variant itself, but normalizing here keeps the request
 * body, the optimistic stock update and the receipt in agreement.
 */
export function normalizeSaleItems(
  items: readonly CounterSaleItemInput[],
): CounterSaleItemInput[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const quantity = Math.floor(item.quantity);
    if (!item.variantId || quantity <= 0) continue;
    totals.set(item.variantId, (totals.get(item.variantId) || 0) + quantity);
  }
  return Array.from(totals, ([variantId, quantity]) => ({ variantId, quantity })).sort(
    (first, second) => first.variantId.localeCompare(second.variantId),
  );
}

export type CounterSaleResult = {
  orderId: string;
  orderNumber: string;
};

/**
 * Call `complete_counter_sale`.
 *
 * The client is injected rather than imported so this stays pure enough to
 * test, matching `creditLoyaltyPoints` in src/domain/commerce/rewards.ts.
 */
export async function completeCounterSale(
  supabase: Pick<SupabaseClient, "rpc">,
  input: CounterSaleInput,
): Promise<{ sale: CounterSaleResult | null; error: { message: string; code?: string } | null }> {
  const items = normalizeSaleItems(input.items);
  if (items.length === 0) {
    return { sale: null, error: { message: "At least one item is required." } };
  }

  const { data, error } = await supabase.rpc("complete_counter_sale", {
    p_staff_id: input.staffId,
    p_items: items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
    })),
    p_payment_method: input.paymentMethod,
    p_customer_name: input.customerName?.trim() || "Walk-in Customer",
    p_customer_phone: input.customerPhone?.trim() || "",
    p_idempotency_key: input.idempotencyKey || null,
  });

  if (error) {
    return { sale: null, error: { message: error.message, code: error.code } };
  }

  // `returns table (...)` arrives as an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.order_id) {
    return { sale: null, error: { message: "The sale did not return an order." } };
  }

  return {
    sale: { orderId: String(row.order_id), orderNumber: String(row.order_number || "") },
    error: null,
  };
}
