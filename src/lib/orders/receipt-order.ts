import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Everything a Baebe Boo receipt is made of, and the queries that assemble it.
 *
 * This used to live inside `src/components/account/OrderReceipt.tsx`. It was
 * moved out because three consumers now need the data and only one of them
 * renders JSX:
 *
 *   - the receipt pages (the component)
 *   - the PDF generator (`@/lib/pdf/receipt-pdf`)
 *   - the paid-order confirmation email (`@/lib/orders/order-confirmation`)
 *
 * The last of those is reached from a Paystack webhook. Importing the component
 * module there would drag `PrintButton` — a `"use client"` boundary — and JSX
 * into the payment path's server bundle for no reason.
 *
 * `confirmation_email_sent_at` is deliberately NOT part of `ReceiptOrder`. That
 * column arrives with `20260730_order_confirmation_email.sql`, and selecting it
 * here would make both receipt pages 500 on a database that has not had the
 * migration applied. The tolerance for its absence stays where it is, in
 * `order-confirmation.ts`, which is the only code that needs it.
 */
export type ReceiptOrder = {
  id: string;
  orderNumber: string;
  recordCode: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  digitalAddress: string | null;
  orderStatus: string;
  paymentStatus: string;
  orderType: string | null;
  totalAmount: number;
  voucherCredit: number;
  createdAt: string;
  shop: { name: string; address: string | null; phone: string | null } | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  payments: {
    id: string;
    provider: string;
    providerReference: string;
    amount: number;
    status: string;
    verifiedAt: string | null;
  }[];
  appliedDiscount: number;
  deliveryFee: number;
};

/**
 * The one place the money on a receipt is decided.
 *
 * Extracted from the component's JSX, where it was the only copy. The emailed
 * receipt and the PDF both have to agree with the web page about what a
 * customer paid, and three independent copies of this expression is precisely
 * how they would stop agreeing.
 *
 * `totalAmount` wins whenever there is one, because that is the figure the
 * order was actually charged at. The computed fallback only covers rows that
 * predate a stored total.
 */
export function receiptTotals(order: ReceiptOrder): {
  subtotal: number;
  computedTotal: number;
  displayTotal: number;
} {
  const subtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const computedTotal = Math.max(
    0,
    subtotal - order.appliedDiscount + order.deliveryFee,
  );
  return {
    subtotal,
    computedTotal,
    displayTotal: order.totalAmount > 0 ? order.totalAmount : computedTotal,
  };
}

/** Long-form date, in the locale the shop trades in. */
export function formatReceiptDate(iso: string): string {
  const date = new Date(iso);
  // A malformed timestamp used to print the literal string "Invalid Date" on a
  // customer's receipt. An empty slot is a better failure than a wrong claim.
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GH", { dateStyle: "long" });
}

export function formatReceiptDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GH");
}

export function statusLabel(status: string): string {
  return String(status).replaceAll("_", " ");
}

/**
 * Checkout stores the GhanaPost GPS code as a "GhanaPost GPS: …" line inside
 * the one delivery_address text column — there is no dedicated column. Pull it
 * back out so the receipt can show it on its own line.
 */
function splitDeliveryAddress(blob: string | null | undefined) {
  const lines = (blob ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  let digitalAddress: string | null = null;
  const addressLines: string[] = [];
  for (const line of lines) {
    const gps = line.match(/^GhanaPost GPS:\s*(.+)$/i);
    if (gps) {
      digitalAddress = gps[1].trim();
      continue;
    }
    addressLines.push(line);
  }
  return { address: addressLines.join("\n") || null, digitalAddress };
}

/** Load a receipt by the order number a customer can see and type. */
export function loadReceiptOrder(orderNumber: string): Promise<ReceiptOrder | null> {
  return loadReceiptOrderBy("order_number", orderNumber);
}

/**
 * Load a receipt by primary key.
 *
 * `sendOrderConfirmation` is handed an order id, not an order number, and going
 * via the number would mean an extra round trip purely to translate one into
 * the other.
 */
export function loadReceiptOrderById(orderId: string): Promise<ReceiptOrder | null> {
  return loadReceiptOrderBy("id", orderId);
}

async function loadReceiptOrderBy(
  column: "order_number" | "id",
  value: string,
): Promise<ReceiptOrder | null> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      `id, order_number, customer_name, customer_email, customer_phone,
       delivery_address, order_status, payment_status, order_type,
       total_amount, voucher_credit, created_at, shop_id`,
    )
    .eq(column, value)
    .maybeSingle();

  if (error || !order) return null;

  const [
    { data: items },
    { data: payments },
    { data: allocations },
    { data: promotions },
    { data: shopRow },
  ] = await Promise.all([
    supabaseAdmin
      .from("order_items")
      .select("id, product_name, quantity, unit_price, total_price, price")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("payment_attempts")
      .select("id, provider, provider_reference, amount, status, verified_at")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("fulfilment_allocations").select("delivery_fee").eq("order_id", order.id),
    supabaseAdmin.from("applied_promotions").select("discount_amount").eq("order_id", order.id),
    order.shop_id
      ? supabaseAdmin
          .from("shops")
          .select("name, location, whatsapp_number")
          .eq("id", order.shop_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const lineItems = (items || []).map((item) => {
    // `complete_counter_sale` writes `price` while online checkout writes
    // `unit_price`, and older rows have only `total_price`. All three shapes
    // are live in production, so the receipt reads them in that order.
    const unit =
      Number(item.unit_price ?? item.price ?? 0) ||
      (Number(item.total_price ?? 0) > 0 && Number(item.quantity ?? 0) > 0
        ? Number(item.total_price) / Number(item.quantity)
        : 0);
    const total = Number(item.total_price ?? 0) || unit * Number(item.quantity ?? 0);
    return {
      id: item.id,
      productName: String(item.product_name || "Item"),
      quantity: Number(item.quantity || 0),
      unitPrice: unit,
      totalPrice: total,
    };
  });

  const promotionDiscount = (promotions || []).reduce(
    (sum, row) => sum + Number(row.discount_amount || 0),
    0,
  );
  const voucherCredit = Number(order.voucher_credit || 0);
  const appliedDiscount = promotionDiscount + voucherCredit;
  const deliveryFee = (allocations || []).reduce(
    (sum, row) => sum + Number(row.delivery_fee || 0),
    0,
  );

  const { address, digitalAddress } = splitDeliveryAddress(
    order.delivery_address ? String(order.delivery_address) : null,
  );

  return {
    id: order.id,
    orderNumber: order.order_number,
    recordCode: null,
    customerName: order.customer_name ? String(order.customer_name) : null,
    customerEmail: order.customer_email ? String(order.customer_email) : null,
    customerPhone: order.customer_phone ? String(order.customer_phone) : null,
    deliveryAddress: address,
    digitalAddress,
    orderStatus: String(order.order_status || ""),
    paymentStatus: String(order.payment_status || ""),
    orderType: order.order_type ? String(order.order_type) : null,
    totalAmount: Number(order.total_amount || 0),
    voucherCredit,
    createdAt: order.created_at,
    shop: shopRow
      ? {
          name: String(shopRow.name || ""),
          // The shops table stores `location` and `whatsapp_number`; the old
          // `address`/`phone` columns never existed and 404'd every receipt.
          address: shopRow.location ? String(shopRow.location) : null,
          phone: shopRow.whatsapp_number ? String(shopRow.whatsapp_number) : null,
        }
      : null,
    items: lineItems,
    payments: (payments || []).map((payment) => ({
      id: payment.id,
      provider: String(payment.provider || ""),
      providerReference: String(payment.provider_reference || ""),
      amount: Number(payment.amount || 0),
      status: String(payment.status || ""),
      verifiedAt: payment.verified_at ? String(payment.verified_at) : null,
    })),
    appliedDiscount,
    deliveryFee,
  };
}

/** A receipt the signed-in customer owns. */
export async function authorizeReceiptBySession(
  orderNumber: string,
): Promise<ReceiptOrder | null> {
  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return null;

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber)
    .eq("customer_user_id", userId)
    .maybeSingle();

  if (!order) return null;
  return loadReceiptOrder(orderNumber);
}

/**
 * A receipt proved by the order number plus the email used at checkout.
 *
 * This is how a guest — who has no account to sign in to — reaches their own
 * receipt. The pair is a bearer credential, so callers must not distinguish
 * "no such order" from "not yours" in what they return.
 */
export async function authorizeReceiptByEmail(
  orderNumber: string,
  email: string,
): Promise<ReceiptOrder | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber)
    .eq("customer_email", normalizedEmail)
    .maybeSingle();

  if (!order) return null;
  return loadReceiptOrder(orderNumber);
}
