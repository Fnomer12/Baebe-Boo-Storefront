import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fulfilment progress derived from `order_status`, the column the admin's
 * `transition_order` flow actually drives. The dedicated shipping columns are
 * a later addition and are NULL on every order that predates them, so the
 * status pill must never depend on them.
 */
function deriveShippingStatus(orderStatus: string | null | undefined) {
  switch (orderStatus) {
    case "dispatched":
    case "shipped":
      return "shipped" as const;
    case "delivered":
    case "completed":
      return "delivered" as const;
    case "cancelled":
    case "refunded":
      return "cancelled" as const;
    default:
      return "received" as const;
  }
}

/**
 * Checkout flattens the GhanaPost GPS code and courier notes into the one
 * `delivery_address` text column. Pull the GPS line back out for display and
 * keep the remaining lines as the street address.
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
  return { address: addressLines.join("\n"), digitalAddress };
}

const baseColumns =
  "id, order_number, customer_name, total_amount, delivery_address, order_status, created_at";

export async function POST(request: Request) {
  const throttle = rateLimit(request, "order-track", 20, 60_000);
  if (!throttle.allowed) {
    return NextResponse.json(
      { message: "Too many lookup attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!orderNumber || !emailPattern.test(email)) {
    return NextResponse.json({ message: "Enter a valid order number and email." }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { message: "Order tracking is temporarily unavailable." },
      { status: 503 },
    );
  }

  // The shipping timestamps only exist once the 20260808 migration has run;
  // retry without them so tracking keeps working on a database that does not
  // have them yet (PostgREST fails the whole select on one unknown column).
  type TrackRow = Record<string, unknown> & {
    delivery_address?: string | null;
    order_status?: string | null;
  };
  let rows: TrackRow[] | null = null;
  const first = await supabaseAdmin
    .from("orders")
    .select(`${baseColumns}, shipped_at, delivered_at`)
    .eq("order_number", orderNumber)
    .eq("customer_email", email)
    .limit(1);
  if (!first.error) {
    rows = (first.data ?? []) as TrackRow[];
  } else {
    const second = await supabaseAdmin
      .from("orders")
      .select(baseColumns)
      .eq("order_number", orderNumber)
      .eq("customer_email", email)
      .limit(1);
    if (!second.error) rows = (second.data ?? []) as TrackRow[];
  }

  if (rows === null) {
    return NextResponse.json(
      { message: "Order tracking is temporarily unavailable." },
      { status: 500 },
    );
  }

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  const { address, digitalAddress } = splitDeliveryAddress(row.delivery_address);
  return NextResponse.json({
    orders: [
      {
        id: row.id,
        order_number: row.order_number,
        customer_name: row.customer_name,
        total_amount: row.total_amount,
        delivery_address: address,
        digital_address: digitalAddress,
        order_status: row.order_status,
        shipping_status: deriveShippingStatus(row.order_status),
        shipped_at: (row.shipped_at as string | null | undefined) ?? null,
        delivered_at: (row.delivered_at as string | null | undefined) ?? null,
        created_at: row.created_at,
      },
    ],
  });
}
