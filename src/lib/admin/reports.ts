import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStaffCustomerEmail } from "@/lib/auth/staff-customers";

export type ProfitSummary = {
  revenue: number;
  costOfGoodsSold: number;
  discounts: number;
  refunds: number;
  grossProfit: number;
  orderCount: number;
  grossMargin: number;
};

export type SalesByBranchRow = {
  shopId: string;
  shopName: string;
  orderCount: number;
  revenue: number;
  grossProfit: number;
};

export type SalesByCashierRow = {
  staffId: string;
  cashierName: string;
  shopId: string;
  shopName: string;
  orderCount: number;
  totalSales: number;
  averageOrderValue: number;
};

export type TopCustomerRow = {
  userId: string;
  customerName: string;
  email: string;
  phone: string;
  totalOrders: number;
  lifetimeSpend: number;
  averageOrderValue: number;
  lastOrderAt: string | null;
  loyaltyPoints: number;
};

export type TopBrandRow = {
  brandId: string;
  brandName: string;
  unitsSold: number;
  revenue: number;
};

export type InventoryHealthRow = {
  inventoryLevelId: string;
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  shopId: string;
  shopName: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  unitsSold30d: number;
  status: "low_stock" | "dead_stock" | "slow_moving" | "healthy";
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function startOfYearDate() {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function emptyProfit(): ProfitSummary {
  return {
    revenue: 0,
    costOfGoodsSold: 0,
    discounts: 0,
    refunds: 0,
    grossProfit: 0,
    orderCount: 0,
    grossMargin: 0,
  };
}

function normalizeProfit(row: Record<string, unknown>): ProfitSummary {
  const revenue = Number(row.revenue || 0);
  const grossProfit = Number(row.gross_profit || 0);
  return {
    revenue,
    costOfGoodsSold: Number(row.cost_of_goods_sold || 0),
    discounts: Number(row.discounts || 0),
    refunds: Number(row.refunds || 0),
    grossProfit,
    orderCount: Number(row.order_count || 0),
    grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
  };
}

export async function loadProfitSummary(
  period: "today" | "month" | "year" = "today",
): Promise<ProfitSummary> {
  const today = todayDate();
  const start = period === "today" ? today : period === "month" ? startOfMonthDate() : startOfYearDate();

  const { data, error } = await supabaseAdmin.rpc("profit_summary", {
    p_start_date: start,
    p_end_date: today,
  });

  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  return rows.length > 0 ? normalizeProfit(rows[0]) : emptyProfit();
}

export async function loadSalesByBranch(): Promise<SalesByBranchRow[]> {
  const { data, error } = await supabaseAdmin
    .from("report_daily_profit")
    .select("shop_id, shop_name, order_count, revenue, gross_profit")
    .order("revenue", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    shopId: String(row.shop_id),
    shopName: String(row.shop_name),
    orderCount: Number(row.order_count || 0),
    revenue: Number(row.revenue || 0),
    grossProfit: Number(row.gross_profit || 0),
  }));
}

export async function loadSalesByCashier(): Promise<SalesByCashierRow[]> {
  const { data, error } = await supabaseAdmin
    .from("report_sales_by_cashier")
    .select("staff_id, cashier_name, shop_id, shop_name, order_count, total_sales, average_order_value")
    .order("total_sales", { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    staffId: String(row.staff_id),
    cashierName: String(row.cashier_name),
    shopId: String(row.shop_id),
    shopName: String(row.shop_name),
    orderCount: Number(row.order_count || 0),
    totalSales: Number(row.total_sales || 0),
    averageOrderValue: Number(row.average_order_value || 0),
  }));
}

export async function loadTopCustomers(limit = 20): Promise<TopCustomerRow[]> {
  const { data, error } = await supabaseAdmin
    .from("report_top_customers")
    .select("user_id, customer_name, email, phone, total_orders, lifetime_spend, average_order_value, last_order_at, loyalty_points")
    .order("lifetime_spend", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  // Till logins own customer_profiles rows via the bootstrap trigger and the
  // view has no staff filter — drop them here so staff never rank as
  // customers. Over-fetch is unnecessary: staff rows are rare, and the limit
  // only trims a genuine customer in the pathological all-staff case.
  let staffUserIds = new Set<string>();
  try {
    const { data: staff } = await supabaseAdmin
      .from("shop_staff")
      .select("auth_user_id")
      .not("auth_user_id", "is", null);
    staffUserIds = new Set(
      (staff || []).map((row) => String((row as { auth_user_id: unknown }).auth_user_id || "")).filter(Boolean),
    );
  } catch {
    staffUserIds = new Set();
  }

  return (data || [])
    .filter(
      (row) =>
        !staffUserIds.has(String(row.user_id)) && !isStaffCustomerEmail(String(row.email || "")),
    )
    .map((row) => ({
    userId: String(row.user_id),
    customerName: String(row.customer_name || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    totalOrders: Number(row.total_orders || 0),
    lifetimeSpend: Number(row.lifetime_spend || 0),
    averageOrderValue: Number(row.average_order_value || 0),
    lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
    loyaltyPoints: Number(row.loyalty_points || 0),
  }));
}

export async function loadTopBrands(limit = 20): Promise<TopBrandRow[]> {
  const { data, error } = await supabaseAdmin
    .from("report_top_brands")
    .select("brand_id, brand_name, units_sold, revenue")
    .order("revenue", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    brandId: String(row.brand_id),
    brandName: String(row.brand_name),
    unitsSold: Number(row.units_sold || 0),
    revenue: Number(row.revenue || 0),
  }));
}

export async function loadInventoryHealth(
  status?: "low_stock" | "dead_stock" | "slow_moving" | "healthy",
): Promise<InventoryHealthRow[]> {
  let query = supabaseAdmin
    .from("report_inventory_health")
    .select(
      "inventory_level_id, variant_id, product_id, product_name, sku, shop_id, shop_name, on_hand, reserved, available, reorder_point, units_sold_30d, status",
    )
    .order("available", { ascending: true });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    inventoryLevelId: String(row.inventory_level_id),
    variantId: String(row.variant_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    sku: String(row.sku),
    shopId: String(row.shop_id),
    shopName: String(row.shop_name),
    onHand: Number(row.on_hand || 0),
    reserved: Number(row.reserved || 0),
    available: Number(row.available || 0),
    reorderPoint: Number(row.reorder_point || 0),
    unitsSold30d: Number(row.units_sold_30d || 0),
    status: String(row.status) as InventoryHealthRow["status"],
  }));
}
