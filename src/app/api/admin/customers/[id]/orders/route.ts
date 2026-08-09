import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { escapeLikePattern } from "@/domain/crm/customer-identity";
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

  let orderQuery = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_email, customer_phone, customer_user_id, total_amount, payment_status, order_status, order_type, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  // The email match used to be `%email%` — a substring search, so
  // `ama@example.com` also pulled in `mama@example.com.gh`, and any `_` in the
  // address matched any character. Escaped and anchored, it is an exact match
  // that still ignores case, which is what guest orders need: they carry an
  // address and no user id.
  const emailPattern = customer.email ? escapeLikePattern(customer.email) : "";
  if (customer.userId && emailPattern) {
    orderQuery = orderQuery.or(
      `customer_user_id.eq.${customer.userId},customer_email.ilike.${emailPattern}`,
    );
  } else if (customer.userId) {
    orderQuery = orderQuery.eq("customer_user_id", customer.userId);
  } else if (emailPattern) {
    orderQuery = orderQuery.ilike("customer_email", emailPattern);
  } else {
    return NextResponse.json({ orders: [] });
  }

  const { data: orders, error: ordersError } = await orderQuery;
  if (ordersError) {
    return NextResponse.json({ message: "Orders could not be loaded." }, { status: 500 });
  }

  const orderIds = (orders || []).map((order) => order.id);
  const { data: items } = orderIds.length
    ? await supabaseAdmin
        .from("order_items")
        .select("id, order_id, product_id, product_name, quantity, price")
        .in("order_id", orderIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  type OrderItemRow = {
    id: string;
    order_id: string;
    product_id: string | null;
    product_name: string | null;
    quantity: number | null;
    price: number | null;
  };

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of (items || []) as OrderItemRow[]) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return NextResponse.json({
    orders: (orders || []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number || "",
      customerName: order.customer_name || "",
      customerEmail: order.customer_email || "",
      customerPhone: order.customer_phone || "",
      totalAmount: Number(order.total_amount || 0),
      paymentStatus: order.payment_status || "",
      status: order.order_status || "",
      orderType: order.order_type || "",
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      items: (itemsByOrder.get(order.id) || []).map((item) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name || "",
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
      })),
    })),
  });
}
