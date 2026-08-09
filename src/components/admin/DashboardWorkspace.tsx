"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminSelect,
} from "@/components/admin/AdminWorkspacePrimitives";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import { formatCedis } from "@/domain/money";

type Kpi = {
  dailySales: number;
  monthlySales: number;
  yearlySales: number;
  activeProductCount: number;
  pendingOrderCount: number;
  lowStockCount: number;
};

type ChartPoint = { label: string; value: number };

type DashboardData = {
  kpi: Kpi;
  dailyChart: ChartPoint[];
  monthlyChart: ChartPoint[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  categoryBreakdown: { category: string; amount: number; percentage: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }[];
};

type ProfitSummary = {
  revenue: number;
  costOfGoodsSold: number;
  discounts: number;
  refunds: number;
  grossProfit: number;
  orderCount: number;
  grossMargin: number;
};

type BranchRow = {
  shopId: string;
  shopName: string;
  orderCount: number;
  revenue: number;
  grossProfit: number;
};

type CashierRow = {
  staffId: string;
  cashierName: string;
  shopId: string;
  shopName: string;
  orderCount: number;
  totalSales: number;
  averageOrderValue: number;
};

type CustomerRow = {
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

type BrandRow = {
  brandId: string;
  brandName: string;
  unitsSold: number;
  revenue: number;
};

type InventoryHealthItem = {
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function statusBadge(status: string) {
  const normalized = status.toLowerCase().replace(/_/g, "-");
  const map: Record<string, string> = {
    paid: "admin-badge-paid",
    received: "admin-badge-pending",
    dispatched: "admin-badge-shipped",
    shipped: "admin-badge-shipped",
    delivered: "admin-badge-delivered",
    completed: "admin-badge-delivered",
    "on-hold": "admin-badge-cancelled",
    cancelled: "admin-badge-cancelled",
  };
  return map[normalized] || "admin-badge-pending";
}

function inventoryStatusBadge(status: InventoryHealthItem["status"]) {
  const map: Record<string, string> = {
    low_stock: "admin-badge-cancelled",
    dead_stock: "admin-badge-pending",
    slow_moving: "admin-badge-paid",
    healthy: "admin-badge-delivered",
  };
  return map[status] || "admin-badge-pending";
}

function inventoryStatusLabel(status: InventoryHealthItem["status"]) {
  const map: Record<string, string> = {
    low_stock: "Low stock",
    dead_stock: "Dead stock",
    slow_moving: "Slow moving",
    healthy: "Healthy",
  };
  return map[status] || status;
}

function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(() => url !== null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!url) return;
    const targetUrl = url;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(targetUrl);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.message || "Could not load data.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

export default function DashboardWorkspace() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [profitPeriod, setProfitPeriod] = useState<"today" | "month" | "year">("today");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/dashboard?year=${year}&month=${month}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.message || "Dashboard could not be loaded.");
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [year, month]);

  const {
    data: profit,
    loading: profitLoading,
    error: profitError,
  } = useFetch<ProfitSummary>(`/api/admin/reports/profit-summary?period=${profitPeriod}`);

  const {
    data: branches,
    loading: branchesLoading,
    error: branchesError,
  } = useFetch<{ branches: BranchRow[] }>("/api/admin/reports/sales-by-branch");

  const {
    data: cashiers,
    loading: cashiersLoading,
    error: cashiersError,
  } = useFetch<{ cashiers: CashierRow[] }>("/api/admin/reports/sales-by-cashier");

  const {
    data: topCustomers,
    loading: customersLoading,
    error: customersError,
  } = useFetch<{ customers: CustomerRow[] }>("/api/admin/reports/top-customers?limit=10");

  const {
    data: topBrands,
    loading: brandsLoading,
    error: brandsError,
  } = useFetch<{ brands: BrandRow[] }>("/api/admin/reports/top-brands?limit=10");

  const {
    data: inventoryHealth,
    loading: inventoryLoading,
    error: inventoryError,
  } = useFetch<{ items: InventoryHealthItem[] }>("/api/admin/reports/inventory-health");

  const availableYears = useMemo(() => {
    const list = [];
    for (let y = 2024; y <= now.getFullYear() + 2; y += 1) list.push(y);
    return list;
  }, [now]);

  // Each chart scales against its own maximum. A shared scale meant the daily
  // chart was measured against monthly totals — and since a month is the sum of
  // its days, the monthly figure is always the larger one, so daily bars were
  // permanently squashed into the bottom fifth of the card no matter how good
  // the day was.
  const maxDailyValue = useMemo(
    () => Math.max(1, ...(data?.dailyChart ?? []).map((d) => d.value)),
    [data],
  );
  const maxMonthlyValue = useMemo(
    () => Math.max(1, ...(data?.monthlyChart ?? []).map((d) => d.value)),
    [data],
  );

  const alertItems = useMemo(
    () => inventoryHealth?.items?.filter((i) => i.status !== "healthy") ?? [],
    [inventoryHealth],
  );

  const reportError = profitError || branchesError || cashiersError || customersError || brandsError || inventoryError;

  if (error) {
    return <AdminErrorState description={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="admin-header">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>
            Overview
          </p>
          <h1>Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <AdminSelect value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {months.map((m, index) => (
              <option key={m} value={index + 1}>{m}</option>
            ))}
          </AdminSelect>
          <AdminSelect value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </AdminSelect>
        </div>
      </div>

      {reportError && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {reportError}
        </div>
      )}

      {loading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="admin-card admin-card-padding h-28 animate-pulse" style={{ background: "var(--color-surface)" }}>
              <div className="h-4 w-24 rounded bg-[var(--color-cream)]" />
              <div className="mt-4 h-8 w-32 rounded bg-[var(--color-cream)]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="admin-card admin-card-padding admin-stat-card">
              <span>Today&apos;s sales</span>
              <strong>{formatCedis(data.kpi.dailySales)}</strong>
            </div>
            <div className="admin-card admin-card-padding admin-stat-card">
              <span>{months[month - 1]} sales</span>
              <strong>{formatCedis(data.kpi.monthlySales)}</strong>
            </div>
            <div className="admin-card admin-card-padding admin-stat-card">
              <span>{year} sales</span>
              <strong>{formatCedis(data.kpi.yearlySales)}</strong>
            </div>
            <div className="admin-card admin-card-padding admin-stat-card">
              <span>Active products</span>
              <strong>{data.kpi.activeProductCount}</strong>
            </div>
            <div className="admin-card admin-card-padding admin-stat-card">
              <span>Pending orders</span>
              <strong>{data.kpi.pendingOrderCount}</strong>
            </div>
            <div className="admin-card admin-card-padding admin-stat-card">
              <span>Low stock items</span>
              <strong>{data.kpi.lowStockCount}</strong>
            </div>
          </div>

          <div className="admin-card admin-card-padding">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} style={{ color: "var(--color-brand-deep)" }} />
                <h2 className="text-lg font-semibold">Profit summary</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExportCsvButton href={`/api/admin/reports/export?report=profit&period=${profitPeriod}`} />
                <div className="flex rounded-full border border-[var(--color-line)] bg-[var(--color-cream)] p-1">
                {(["today", "month", "year"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProfitPeriod(p)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${
                      profitPeriod === p
                        ? "bg-[var(--color-ink)] text-white"
                        : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {p === "today" ? "Today" : p === "month" ? "This month" : "This year"}
                  </button>
                ))}
              </div>
              </div>
            </div>

            {profitLoading || !profit ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-cream)]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>Revenue</p>
                  <p className="mt-2 text-2xl font-bold">{formatCedis(profit.revenue)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>Gross profit</p>
                  <p className="mt-2 text-2xl font-bold">{formatCedis(profit.grossProfit)}</p>
                </div>
                <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>Gross margin</p>
                  <p className="mt-2 text-2xl font-bold">{profit.grossMargin}%</p>
                </div>
                <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>Orders</p>
                  <p className="mt-2 text-2xl font-bold">{profit.orderCount}</p>
                </div>
              </div>
            )}

            {profit && (
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="flex justify-between rounded-xl bg-[var(--color-cream)] px-4 py-2">
                  <span style={{ color: "var(--color-ink-soft)" }}>Cost of goods</span>
                  <span className="font-semibold">{formatCedis(profit.costOfGoodsSold)}</span>
                </div>
                <div className="flex justify-between rounded-xl bg-[var(--color-cream)] px-4 py-2">
                  <span style={{ color: "var(--color-ink-soft)" }}>Discounts</span>
                  <span className="font-semibold">{formatCedis(profit.discounts)}</span>
                </div>
                <div className="flex justify-between rounded-xl bg-[var(--color-cream)] px-4 py-2">
                  <span style={{ color: "var(--color-ink-soft)" }}>Refunds</span>
                  <span className="font-semibold">{formatCedis(profit.refunds)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="admin-card admin-card-padding">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Daily sales</h2>
                <Calendar size={16} style={{ color: "var(--color-ink-soft)" }} />
              </div>
              {/* h-full and justify-end on each column below are load-bearing,
                  not cosmetic: the row's items-end stops the columns
                  stretching, and a column sized to its label alone gives the
                  bar's percentage height no basis to resolve against — every
                  bar rendered at 0px, so both charts drew bare axes. */}
              {data.dailyChart.every((d) => d.value === 0) ? (
                <p className="py-8 text-center text-sm" style={{ color: "var(--color-ink-soft)" }}>No sales yet this month.</p>
              ) : (
                // Scrolls sideways on a phone: 31 day columns can't shrink
                // below their labels, and without a scroller they widen the
                // whole layout viewport instead of just this card.
                <div className="overflow-x-auto overscroll-contain">
                <div className="flex items-end gap-1 h-48 min-w-[26rem]">
                  {data.dailyChart.map((point) => (
                    <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded-t-md"
                        style={{
                          height: `${Math.max(4, (point.value / maxDailyValue) * 100)}%`,
                          background: "var(--color-brand)",
                          opacity: point.value ? 1 : 0.25,
                        }}
                        title={`${point.label}: ${formatCedis(point.value)}`}
                      />
                      <span className="text-[10px]" style={{ color: "var(--color-ink-soft)" }}>{point.label}</span>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </div>

            <div className="admin-card admin-card-padding">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Monthly sales</h2>
                <TrendingUp size={16} style={{ color: "var(--color-ink-soft)" }} />
              </div>
              {data.monthlyChart.every((d) => d.value === 0) ? (
                <p className="py-8 text-center text-sm" style={{ color: "var(--color-ink-soft)" }}>No sales yet this year.</p>
              ) : (
                <div className="overflow-x-auto overscroll-contain">
                <div className="flex items-end gap-2 h-48 min-w-[24rem]">
                  {data.monthlyChart.map((point) => (
                    <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded-t-md"
                        style={{
                          height: `${Math.max(4, (point.value / maxMonthlyValue) * 100)}%`,
                          background: "var(--color-brand-deep)",
                          opacity: point.value ? 1 : 0.25,
                        }}
                        title={`${point.label}: ${formatCedis(point.value)}`}
                      />
                      <span className="text-[10px]" style={{ color: "var(--color-ink-soft)" }}>{point.label}</span>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="admin-card admin-card-padding">
              <div className="mb-4 flex items-center gap-2">
                <Store size={18} style={{ color: "var(--color-brand-deep)" }} />
                <h2 className="text-lg font-semibold">Sales by branch</h2>
              </div>
              {branchesLoading || !branches ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
                  ))}
                </div>
              ) : branches.branches.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No branch sales data yet.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Branch</th>
                        <th>Orders</th>
                        <th>Revenue</th>
                        <th>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.branches.map((branch) => (
                        <tr key={branch.shopId}>
                          <td><strong>{branch.shopName}</strong></td>
                          <td>{branch.orderCount}</td>
                          <td>{formatCedis(branch.revenue)}</td>
                          <td>{formatCedis(branch.grossProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-card admin-card-padding">
              <div className="mb-4 flex items-center gap-2">
                <Users size={18} style={{ color: "var(--color-brand-deep)" }} />
                <h2 className="text-lg font-semibold">Sales by cashier</h2>
              </div>
              {cashiersLoading || !cashiers ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
                  ))}
                </div>
              ) : cashiers.cashiers.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No cashier sales data yet.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Cashier</th>
                        <th>Branch</th>
                        <th>Orders</th>
                        <th>Sales</th>
                        <th>AOV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashiers.cashiers.map((cashier) => (
                        <tr key={cashier.staffId}>
                          <td><strong>{cashier.cashierName}</strong></td>
                          <td>{cashier.shopName}</td>
                          <td>{cashier.orderCount}</td>
                          <td>{formatCedis(cashier.totalSales)}</td>
                          <td>{formatCedis(cashier.averageOrderValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="admin-card admin-card-padding">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users size={18} style={{ color: "var(--color-brand-deep)" }} />
                  <h2 className="text-lg font-semibold">Top customers</h2>
                </div>
                <ExportCsvButton href="/api/admin/reports/export?report=top-customers&limit=10" />
              </div>
              {customersLoading || !topCustomers ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
                  ))}
                </div>
              ) : topCustomers.customers.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No customer sales data yet.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Orders</th>
                        <th>Lifetime</th>
                        <th>AOV</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCustomers.customers.map((customer) => (
                        <tr key={customer.userId}>
                          <td>
                            <strong>{customer.customerName || "Guest"}</strong>
                            <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>{customer.email || customer.phone}</p>
                          </td>
                          <td>{customer.totalOrders}</td>
                          <td>{formatCedis(customer.lifetimeSpend)}</td>
                          <td>{formatCedis(customer.averageOrderValue)}</td>
                          <td>{customer.loyaltyPoints.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-card admin-card-padding">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={18} style={{ color: "var(--color-brand-deep)" }} />
                  <h2 className="text-lg font-semibold">Top brands</h2>
                </div>
                <ExportCsvButton href="/api/admin/reports/export?report=top-brands&limit=10" />
              </div>
              {brandsLoading || !topBrands ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
                  ))}
                </div>
              ) : topBrands.brands.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No brand sales data yet.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Brand</th>
                        <th>Units sold</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topBrands.brands.map((brand) => (
                        <tr key={brand.brandId}>
                          <td><strong>{brand.brandName}</strong></td>
                          <td>{brand.unitsSold}</td>
                          <td>{formatCedis(brand.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="admin-card admin-card-padding">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} style={{ color: "var(--color-brand-deep)" }} />
                <h2 className="text-lg font-semibold">Inventory health</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ExportCsvButton href="/api/admin/reports/export?report=inventory" />
                <Link href="/BaebeAdmin/products" className="admin-button-secondary text-xs px-3 py-2">
                  Manage products <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            {inventoryLoading || !inventoryHealth ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
                ))}
              </div>
            ) : alertItems.length === 0 ? (
              <div className="flex items-start gap-3 rounded-2xl bg-[#e8f5e9] px-4 py-3 text-sm" style={{ color: "#2e7d32" }}>
                <RefreshCw size={18} />
                <span>Inventory looks healthy. No low stock, dead stock, or slow-moving items right now.</span>
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Branch</th>
                      <th>Status</th>
                      <th>On hand</th>
                      <th>Available</th>
                      <th>30d sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertItems.slice(0, 10).map((item) => (
                      <tr key={item.inventoryLevelId}>
                        <td>
                          <strong>{item.productName}</strong>
                          <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>{item.sku}</p>
                        </td>
                        <td>{item.shopName}</td>
                        <td><span className={`admin-badge ${inventoryStatusBadge(item.status)}`}>{inventoryStatusLabel(item.status)}</span></td>
                        <td>{item.onHand}</td>
                        <td>{item.available}</td>
                        <td>{item.unitsSold30d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="admin-card admin-card-padding lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent orders</h2>
                <Link href="/BaebeAdmin/orders" className="admin-button-secondary text-xs px-3 py-2">
                  View all <ArrowRight size={14} />
                </Link>
              </div>
              {data.recentOrders.length === 0 ? (
                <AdminEmptyState
                  title="No orders yet"
                  description="Orders will appear here once customers start checking out."
                  icon={<ShoppingBag size={24} />}
                />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td><strong>#{order.orderNumber}</strong></td>
                          <td>{order.customerName}</td>
                          <td>{formatCedis(order.totalAmount)}</td>
                          <td><span className={`admin-badge ${statusBadge(order.status)}`}>{order.status.replace(/_/g, " ")}</span></td>
                          <td>{formatDate(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="admin-card admin-card-padding">
                <h2 className="mb-4 text-lg font-semibold">Top products</h2>
                {data.topProducts.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No product sales yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.topProducts.map((product) => (
                      <li key={product.name} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{product.name}</p>
                          <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>{product.quantity} sold</p>
                        </div>
                        <span className="text-sm font-semibold">{formatCedis(product.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="admin-card admin-card-padding">
                <h2 className="mb-4 text-lg font-semibold">Sales by category</h2>
                {data.categoryBreakdown.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No completed order data yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.categoryBreakdown.map((category) => (
                      <li key={category.category}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold">{category.category}</span>
                          <span style={{ color: "var(--color-ink-soft)" }}>{category.percentage}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full" style={{ background: "var(--color-cream)" }}>
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${category.percentage}%`, background: "var(--color-brand)" }}
                          />
                        </div>
                        <p className="mt-1 text-xs" style={{ color: "var(--color-ink-soft)" }}>{formatCedis(category.amount)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
