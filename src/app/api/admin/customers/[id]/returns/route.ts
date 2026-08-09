import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveCustomer } from "../../_customer-record";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  let customer;
  try {
    customer = await resolveCustomer(id);
  } catch {
    return NextResponse.json({ message: "Customer could not be loaded." }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 });
  }

  // A return is raised from /account, so it cannot exist without an account.
  if (!customer.userId) {
    return NextResponse.json({ returns: [] });
  }

  const { data: returns, error: returnsError } = await supabaseAdmin
    .from("return_requests")
    .select("id, order_id, status, reason, notes, requested_at, resolved_at, updated_at")
    .eq("user_id", customer.userId)
    .order("requested_at", { ascending: false });
  if (returnsError) {
    return NextResponse.json({ message: "Returns could not be loaded." }, { status: 500 });
  }

  const returnIds = (returns || []).map((returnRequest) => returnRequest.id);
  const { data: items } = returnIds.length
    ? await supabaseAdmin
        .from("return_items")
        .select("return_id, order_item_id, quantity, condition, resolution")
        .in("return_id", returnIds)
    : { data: [] };

  const orderItemIds = (items || []).map((item) => item.order_item_id);
  const { data: orderItems } = orderItemIds.length
    ? await supabaseAdmin.from("order_items").select("id, product_name").in("id", orderItemIds)
    : { data: [] };

  const productNameByItemId = new Map(
    (orderItems || []).map((item) => [item.id, item.product_name || ""]),
  );

  return NextResponse.json({
    returns: (returns || []).map((returnRequest) => ({
      id: returnRequest.id,
      orderId: returnRequest.order_id,
      status: returnRequest.status,
      reason: returnRequest.reason,
      notes: returnRequest.notes || "",
      requestedAt: returnRequest.requested_at,
      resolvedAt: returnRequest.resolved_at,
      updatedAt: returnRequest.updated_at,
      items: (items || [])
        .filter((item) => item.return_id === returnRequest.id)
        .map((item) => ({
          orderItemId: item.order_item_id,
          productName: productNameByItemId.get(item.order_item_id) || "",
          quantity: Number(item.quantity || 0),
          condition: item.condition || "",
          resolution: item.resolution || "",
        })),
    })),
  });
}
