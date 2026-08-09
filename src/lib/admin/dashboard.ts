import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminDashboardKpi = {
  dailySales: number;
  monthlySales: number;
  yearlySales: number;
  activeProductCount: number;
  pendingOrderCount: number;
  lowStockCount: number;
};

export type AdminDashboardChartPoint = { label: string; value: number };

export type AdminDashboardTopProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

export type AdminDashboardCategoryBreakdown = {
  category: string;
  amount: number;
  percentage: number;
};

export type AdminDashboardRecentOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  status: string;
  createdAt: string;
};

export type AdminDashboardData = {
  kpi: AdminDashboardKpi;
  dailyChart: AdminDashboardChartPoint[];
  monthlyChart: AdminDashboardChartPoint[];
  topProducts: AdminDashboardTopProduct[];
  categoryBreakdown: AdminDashboardCategoryBreakdown[];
  recentOrders: AdminDashboardRecentOrder[];
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).toISOString();
}

function endOfMonth(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59, 999).toISOString();
}

function startOfYear(year: number) {
  return new Date(year, 0, 1).toISOString();
}

function endOfYear(year: number) {
  return new Date(year, 11, 31, 23, 59, 59, 999).toISOString();
}

function sumAmount(rows: { total_amount: number | null }[]) {
  return rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
}

export async function loadAdminDashboard(
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
): Promise<AdminDashboardData> {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);
  const yearStart = startOfYear(year);
  const yearEnd = endOfYear(year);

  const [
    { data: todayOrders },
    { data: monthOrders },
    { data: yearOrders },
    { data: products },
    { data: pendingOrders },
    { data: lowStock },
    { data: orderItems },
    { data: recentOrders },
  ] = await Promise.all([
    supabaseAdmin.from("orders").select("total_amount, created_at").gte("created_at", today).lte("created_at", new Date().toISOString()),
    supabaseAdmin.from("orders").select("total_amount, created_at").gte("created_at", monthStart).lte("created_at", monthEnd),
    supabaseAdmin.from("orders").select("total_amount, created_at").gte("created_at", yearStart).lte("created_at", yearEnd),
    supabaseAdmin.from("products").select("id").eq("is_active", true),
    supabaseAdmin.from("orders").select("id").in("order_status", ["received", "processing", "dispatched", "shipped"]),
    supabaseAdmin.from("inventory_levels").select("id").lte("on_hand", "reorder_point"),
    supabaseAdmin.from("order_items").select("product_name, quantity, price, product_id").gte("created_at", yearStart).lte("created_at", yearEnd),
    supabaseAdmin
      .from("orders")
      .select("id, order_number, customer_name, total_amount, order_status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailySales = Array.from({ length: daysInMonth }, (_, index) => ({ label: String(index + 1), value: 0 }));
  for (const row of monthOrders || []) {
    const day = new Date(row.created_at || monthStart).getDate();
    if (day >= 1 && day <= daysInMonth) {
      dailySales[day - 1].value += Number(row.total_amount || 0);
    }
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlySales = monthNames.map((label) => ({ label, value: 0 }));
  for (const row of yearOrders || []) {
    const m = new Date(row.created_at || yearStart).getMonth();
    monthlySales[m].value += Number(row.total_amount || 0);
  }

  const productMap = new Map<string, AdminDashboardTopProduct>();
  for (const item of orderItems || []) {
    const key = item.product_name || "Unknown";
    const existing = productMap.get(key) || { name: key, quantity: 0, revenue: 0 };
    existing.quantity += Number(item.quantity || 0);
    existing.revenue += Number(item.price || 0) * Number(item.quantity || 0);
    productMap.set(key, existing);
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Category breakdown uses completed_order_items because they carry category.
  const { data: completedItems } = await supabaseAdmin
    .from("completed_order_items")
    .select("category, quantity, price")
    .gte("created_at", yearStart)
    .lte("created_at", yearEnd);

  const categoryMap = new Map<string, number>();
  let categoryTotal = 0;
  for (const item of completedItems || []) {
    const amount = Number(item.price || 0) * Number(item.quantity || 0);
    const category = item.category || "Other";
    categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
    categoryTotal += amount;
  }
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: categoryTotal > 0 ? Math.round((amount / categoryTotal) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    kpi: {
      dailySales: sumAmount(todayOrders || []),
      monthlySales: sumAmount(monthOrders || []),
      yearlySales: sumAmount(yearOrders || []),
      activeProductCount: products?.length || 0,
      pendingOrderCount: pendingOrders?.length || 0,
      lowStockCount: lowStock?.length || 0,
    },
    dailyChart: dailySales,
    monthlyChart: monthlySales,
    topProducts,
    categoryBreakdown,
    recentOrders: (recentOrders || []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      totalAmount: Number(row.total_amount || 0),
      status: row.order_status,
      createdAt: row.created_at,
    })),
  };
}
