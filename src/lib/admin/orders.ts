import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminOrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
};

export type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  totalAmount: number;
  paymentStatus: string;
  status: string;
  orderType: string;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
};

export async function getAdminOrder(orderId: string): Promise<AdminOrderDetail | null> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, customer_name, customer_email, customer_phone, total_amount, payment_status, order_status, order_type, created_at, updated_at")
    .eq("id", orderId)
    .single();
  if (error || !order) return null;

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("id, product_id, product_name, quantity, price")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  return {
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    totalAmount: Number(order.total_amount || 0),
    paymentStatus: order.payment_status,
    status: order.order_status,
    orderType: order.order_type,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (items || []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
    })),
  };
}

export type AdminCompletedOrder = {
  id: string;
  originalOrderId: string;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  orderType: string;
  totalAmount: number;
  completedAt: string;
  items: {
    id: string;
    productName: string;
    productImageUrl: string | null;
    category: string;
    quantity: number;
    price: number;
  }[];
};

export async function listAdminCompletedOrders(filters: {
  type?: string;
  year?: number;
  month?: number;
  search?: string;
}): Promise<AdminCompletedOrder[]> {
  let query = supabaseAdmin
    .from("completed_orders")
    .select("id, original_order_id, order_number, customer_name, customer_code, order_type, total_amount, completed_at")
    .order("completed_at", { ascending: false });

  if (filters.type && filters.type !== "all") {
    query = query.eq("order_type", filters.type);
  }
  if (filters.year) {
    const start = new Date(filters.year, (filters.month || 1) - 1, 1).toISOString();
    const end = filters.month
      ? new Date(filters.year, filters.month, 0, 23, 59, 59, 999).toISOString()
      : new Date(filters.year, 11, 31, 23, 59, 59, 999).toISOString();
    query = query.gte("completed_at", start).lte("completed_at", end);
  }

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);

  const orderIds = (orders || []).map((o) => o.id);
  const { data: items } = orderIds.length
    ? await supabaseAdmin.from("completed_order_items").select("id, completed_order_id, product_name, product_image_url, category, quantity, price").in("completed_order_id", orderIds)
    : { data: [] };

  const itemsByOrder = new Map<string, AdminCompletedOrder["items"]>();
  for (const item of items || []) {
    const list = itemsByOrder.get(item.completed_order_id) || [];
    list.push({
      id: item.id,
      productName: item.product_name,
      productImageUrl: item.product_image_url,
      category: item.category || "Other",
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
    });
    itemsByOrder.set(item.completed_order_id, list);
  }

  const result = (orders || []).map((order) => ({
    id: order.id,
    originalOrderId: order.original_order_id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    customerCode: order.customer_code,
    orderType: order.order_type,
    totalAmount: Number(order.total_amount || 0),
    completedAt: order.completed_at,
    items: itemsByOrder.get(order.id) || [],
  }));

  if (!filters.search) return result;

  const needle = filters.search.toLowerCase();
  return result.filter(
    (order) =>
      order.orderNumber.toLowerCase().includes(needle) ||
      order.customerName.toLowerCase().includes(needle) ||
      order.customerCode.toLowerCase().includes(needle),
  );
}
