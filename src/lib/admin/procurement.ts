import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PurchaseOrder, PurchaseOrderItem, Supplier, SupplierBalance } from "@/domain/admin-procurement";

function normalizeSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    contactName: String(row.contact_name || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    address: String(row.address || ""),
    paymentTerms: String(row.payment_terms || ""),
    notes: String(row.notes || ""),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function normalizePurchaseOrderItem(row: Record<string, unknown>): PurchaseOrderItem {
  return {
    id: String(row.id),
    variantId: String(row.variant_id),
    productName: String(row.product_name || "Unknown product"),
    sku: String(row.sku || ""),
    quantity: Number(row.quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    receivedQuantity: Number(row.received_quantity || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

function normalizePurchaseOrder(row: Record<string, unknown>, items: PurchaseOrderItem[] = []): PurchaseOrder {
  return {
    id: String(row.id),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name || "Unknown supplier"),
    shopId: row.shop_id ? String(row.shop_id) : null,
    shopName: row.shop_name ? String(row.shop_name) : null,
    referenceNumber: String(row.reference_number || ""),
    status: String(row.status || "draft") as PurchaseOrder["status"],
    totalAmount: Number(row.total_amount || 0),
    expectedDeliveryDate: row.expected_delivery_date ? String(row.expected_delivery_date) : null,
    receivedAt: row.received_at ? String(row.received_at) : null,
    notes: String(row.notes || ""),
    items,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(normalizeSupplier);
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const { data, error } = await supabaseAdmin.from("suppliers").select("*").eq("id", id).single();
  if (error) return null;
  return normalizeSupplier(data);
}

export async function createSupplier(payload: Omit<Supplier, "id" | "createdAt" | "updatedAt">): Promise<Supplier> {
  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .insert({
      name: payload.name,
      contact_name: payload.contactName,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      payment_terms: payload.paymentTerms,
      notes: payload.notes,
      is_active: payload.isActive,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return normalizeSupplier(data);
}

export async function updateSupplier(id: string, payload: Partial<Omit<Supplier, "id" | "createdAt" | "updatedAt">>): Promise<Supplier> {
  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .update({
      name: payload.name,
      contact_name: payload.contactName,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      payment_terms: payload.paymentTerms,
      notes: payload.notes,
      is_active: payload.isActive,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return normalizeSupplier(data);
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("suppliers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listSupplierBalances(): Promise<SupplierBalance[]> {
  const { data, error } = await supabaseAdmin
    .from("supplier_balances")
    .select("supplier_id, supplier_name, total_purchase_orders, received_value, outstanding_balance")
    .order("outstanding_balance", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    totalPurchaseOrders: Number(row.total_purchase_orders || 0),
    receivedValue: Number(row.received_value || 0),
    outstandingBalance: Number(row.outstanding_balance || 0),
  }));
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .select(`
      *,
      suppliers!purchase_orders_supplier_id_fkey(name),
      shops(name)
    `)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const supplierRow = row.suppliers as Record<string, unknown> | null;
    const shopRow = row.shops as Record<string, unknown> | null;
    return normalizePurchaseOrder({
      ...row,
      supplier_name: supplierRow?.name,
      shop_name: shopRow?.name,
    });
  });
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .select(`
      *,
      suppliers!purchase_orders_supplier_id_fkey(name),
      shops(name),
      purchase_order_items(
        *,
        product_variants(sku, product_id, products(name))
      )
    `)
    .eq("id", id)
    .single();

  if (error) return null;

  const supplierRow = data.suppliers as Record<string, unknown> | null;
  const shopRow = data.shops as Record<string, unknown> | null;

  const rawItems = data.purchase_order_items as Record<string, unknown>[] | undefined;
  const items = (rawItems || []).map((item) => {
    const variantRow = item.product_variants as Record<string, unknown> | null;
    const productRow = variantRow?.products as Record<string, unknown> | null;
    return normalizePurchaseOrderItem({
      ...item,
      product_name: productRow?.name,
      sku: variantRow?.sku,
    });
  });

  return normalizePurchaseOrder(
    {
      ...data,
      supplier_name: supplierRow?.name,
      shop_name: shopRow?.name,
    },
    items,
  );
}

export type CreatePurchaseOrderInput = {
  supplierId: string;
  shopId?: string | null;
  referenceNumber?: string;
  expectedDeliveryDate?: string | null;
  notes?: string;
  items: { variantId: string; quantity: number; unitCost: number }[];
};

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .insert({
      supplier_id: input.supplierId,
      shop_id: input.shopId || null,
      reference_number: input.referenceNumber || null,
      expected_delivery_date: input.expectedDeliveryDate || null,
      notes: input.notes || null,
      total_amount: total,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const poItems = input.items.map((item) => ({
    purchase_order_id: data.id,
    variant_id: item.variantId,
    quantity: item.quantity,
    unit_cost: item.unitCost,
    received_quantity: 0,
  }));

  const { error: itemsError } = await supabaseAdmin.from("purchase_order_items").insert(poItems);
  if (itemsError) {
    await supabaseAdmin.from("purchase_orders").delete().eq("id", data.id);
    throw new Error(itemsError.message);
  }

  const created = await getPurchaseOrder(data.id);
  if (!created) throw new Error("Purchase order was created but could not be loaded.");
  return created;
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrder["status"],
): Promise<PurchaseOrder> {
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const updated = await getPurchaseOrder(data.id);
  if (!updated) throw new Error("Purchase order could not be loaded after update.");
  return updated;
}

export type ReceivePurchaseOrderInput = {
  items: {
    purchaseOrderItemId: string;
    quantityReceived: number;
    unitCost?: number;
  }[];
  notes?: string;
};

export async function receivePurchaseOrder(
  id: string,
  input: ReceivePurchaseOrderInput,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("receive_purchase_order", {
    p_purchase_order_id: id,
    p_items: JSON.stringify(input.items),
    p_notes: input.notes || null,
  });

  if (error) throw new Error(error.message);
  return String(data);
}
