"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock,
  Package,
  Search,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminSelect,
} from "@/components/admin/AdminWorkspacePrimitives";
import { formatCedis } from "@/domain/money";

type OrderStatus =
  | "payment_failed"
  | "received"
  | "processing"
  | "on_hold"
  | "dispatched"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded"
  | "paid"
  | "pending_approval";

type OrderSummary = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  totalAmount: number;
  paymentStatus: string;
  status: OrderStatus;
  orderType: string;
  createdAt: string;
  updatedAt: string;
};

type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
};

type OrderDetail = OrderSummary & { items: OrderItem[] };

type QueueTab = "attention" | "received" | "dispatch" | "delivered" | "hold";

type OrderActionStatus = OrderStatus | "dispatch" | "hold";

const tabs: { key: QueueTab; label: string; icon: typeof Box }[] = [
  { key: "attention", label: "Needs attention", icon: AlertTriangle },
  { key: "received", label: "Received", icon: Package },
  { key: "dispatch", label: "Dispatch", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
  { key: "hold", label: "On hold", icon: Clock },
];

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function normalizeStatus(status: OrderActionStatus) {
  if (status === "dispatch") return "dispatched";
  if (status === "hold") return "on_hold";
  return status;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function statusBadgeClass(status: OrderStatus) {
  const map: Record<string, string> = {
    paid: "admin-badge-paid",
    pending_approval: "admin-badge-pending",
    received: "admin-badge-pending",
    processing: "admin-badge-pending",
    dispatched: "admin-badge-shipped",
    shipped: "admin-badge-shipped",
    delivered: "admin-badge-delivered",
    completed: "admin-badge-delivered",
    on_hold: "admin-badge-cancelled",
    cancelled: "admin-badge-cancelled",
    refunded: "admin-badge-cancelled",
  };
  return map[status] || "admin-badge-pending";
}

export default function OrdersWorkspace({ view }: { view?: string }) {
  const isArchive = view === "archive";
  const [activeTab, setActiveTab] = useState<QueueTab>("attention");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/orders");
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.message || "Orders could not be loaded.");
        if (!cancelled) setOrders(json.orders || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = orders;
    if (needle) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(needle) ||
          o.customerName.toLowerCase().includes(needle) ||
          o.customerEmail?.toLowerCase().includes(needle),
      );
    }
    switch (activeTab) {
      case "attention":
        return list.filter((o) => o.status === "paid" || o.status === "pending_approval");
      case "received":
        return list.filter((o) => o.status === "received");
      case "dispatch":
        return list.filter((o) => o.status === "dispatched" || o.status === "shipped");
      case "delivered":
        return list.filter((o) => o.status === "delivered");
      case "hold":
        return list.filter((o) => o.status === "on_hold");
      default:
        return list;
    }
  }, [orders, query, activeTab]);

  async function updateStatus(orderId: string, nextStatus: OrderActionStatus) {
    setUpdating(orderId);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "Update failed.");
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: normalizeStatus(nextStatus) as OrderStatus } : o)),
      );
      if (detail?.id === orderId) {
        setDetail((d) => (d ? { ...d, status: normalizeStatus(nextStatus) as OrderStatus } : d));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setUpdating(null);
    }
  }

  /**
   * Email the customer their receipt again, with the PDF attached.
   *
   * The outcome is reported in full rather than as a bare "sent": a simulated
   * send means the mailer is unconfigured and delivered nothing, and a missing
   * attachment means they got the email without the document. Both are things
   * the person who pressed the button needs to know.
   */
  async function resendReceipt(orderId: string) {
    setResending(orderId);
    setReceiptNotice(null);
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/receipt/resend`, {
        method: "POST",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message || "The receipt could not be sent.");

      if (json.simulated) {
        setReceiptNotice("Email is not configured, so nothing was actually delivered.");
      } else if (json.attachmentFailed) {
        setReceiptNotice("Receipt sent, but the PDF could not be attached.");
      } else {
        setReceiptNotice("Receipt sent with the PDF attached.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The receipt could not be sent.");
    } finally {
      setResending(null);
    }
  }

  async function openDetail(order: OrderSummary) {
    setReceiptNotice(null);
    setDetailOpen(true);
    setDetail({ ...order, items: [] });
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`);
      const json = await response.json().catch(() => ({}));
      if (response.ok) setDetail(json.order);
    } catch {
      // ignore; summary is already shown
    }
  }

  if (isArchive) {
    return <ArchiveWorkspace />;
  }

  if (error) {
    return <AdminErrorState description={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="admin-header">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>Operations</p>
          <h1>Orders</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-sm sm:flex-row sm:items-center">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--color-cream)] px-4">
          <Search size={17} style={{ color: "var(--color-ink-soft)" }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders or customers…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-soft)]/60"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => {
          const count = orders.filter((o) => {
            if (key === "attention") return o.status === "paid" || o.status === "pending_approval";
            if (key === "received") return o.status === "received";
            if (key === "dispatch") return o.status === "dispatched" || o.status === "shipped";
            if (key === "delivered") return o.status === "delivered";
            return o.status === "on_hold";
          }).length;
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-tint)]"
              }`}
            >
              <Icon size={16} />
              {label}
              {count > 0 && (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/20" : "bg-[var(--color-cream)]"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="admin-card admin-card-padding h-40 animate-pulse">
              <div className="h-4 w-20 rounded bg-[var(--color-cream)]" />
              <div className="mt-4 h-6 w-32 rounded bg-[var(--color-cream)]" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <AdminEmptyState
          title="No orders in this queue"
          description="Orders will appear here as customers check out and move through fulfilment."
          icon={<Box size={24} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="admin-card admin-card-padding flex flex-col gap-4 transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">#{order.orderNumber}</p>
                  <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>{order.customerName}</p>
                </div>
                <span className={`admin-badge ${statusBadgeClass(order.status)}`}>
                  {order.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--color-ink-soft)" }}>{formatDate(order.createdAt)}</span>
                <span className="font-semibold">{formatCedis(order.totalAmount)}</span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openDetail(order)}
                  className="admin-button-secondary flex-1 px-3 py-2 text-xs"
                >
                  Details <ArrowRight size={14} />
                </button>
                {activeTab === "attention" && (
                  <button
                    type="button"
                    disabled={updating === order.id}
                    onClick={() => updateStatus(order.id, "received")}
                    className="admin-button flex-1 px-3 py-2 text-xs"
                  >
                    <ShieldCheck size={14} />
                    {updating === order.id ? "…" : "Approve"}
                  </button>
                )}
                {activeTab === "received" && (
                  <button
                    type="button"
                    disabled={updating === order.id}
                    onClick={() => updateStatus(order.id, "dispatched")}
                    className="admin-button flex-1 px-3 py-2 text-xs"
                  >
                    <Truck size={14} />
                    {updating === order.id ? "…" : "Dispatch"}
                  </button>
                )}
                {activeTab === "dispatch" && (
                  <>
                    <button
                      type="button"
                      disabled={updating === order.id}
                      onClick={() => updateStatus(order.id, "on_hold")}
                      className="admin-button-secondary px-3 py-2 text-xs"
                    >
                      Hold
                    </button>
                    <button
                      type="button"
                      disabled={updating === order.id}
                      onClick={() => updateStatus(order.id, "delivered")}
                      className="admin-button flex-1 px-3 py-2 text-xs"
                    >
                      Deliver
                    </button>
                  </>
                )}
                {activeTab === "delivered" && (
                  <>
                    <button
                      type="button"
                      disabled={updating === order.id}
                      onClick={() => updateStatus(order.id, "on_hold")}
                      className="admin-button-secondary px-3 py-2 text-xs"
                    >
                      Hold
                    </button>
                    <button
                      type="button"
                      disabled={updating === order.id}
                      onClick={() => updateStatus(order.id, "completed")}
                      className="admin-button flex-1 px-3 py-2 text-xs"
                    >
                      Complete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailOpen && detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            onClick={() => setDetailOpen(false)}
            className="flex-1 bg-[var(--color-ink)]/20 backdrop-blur-sm"
            aria-label="Close order details"
          />
          <aside className="w-full max-w-md overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>Order details</p>
                <h2 className="mt-1 text-2xl font-semibold">#{detail.orderNumber}</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-6 space-y-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4 text-sm">
              <p><strong>Customer:</strong> {detail.customerName}</p>
              {detail.customerEmail && <p><strong>Email:</strong> {detail.customerEmail}</p>}
              {detail.customerPhone && <p><strong>Phone:</strong> {detail.customerPhone}</p>}
              <p><strong>Date:</strong> {formatDate(detail.createdAt)}</p>
              <p><strong>Type:</strong> {detail.orderType}</p>
              <p className="flex items-center gap-2">
                <strong>Status:</strong>
                <span className={`admin-badge ${statusBadgeClass(detail.status)}`}>{detail.status.replace(/_/g, " ")}</span>
              </p>
            </div>

            <h3 className="mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>Items</h3>
            {detail.items.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>Loading items…</p>
            ) : (
              <ul className="mb-6 space-y-3">
                {detail.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)] p-3">
                    <div>
                      <p className="font-semibold">{item.productName}</p>
                      <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>Qty: {item.quantity}</p>
                    </div>
                    <span className="font-semibold">{formatCedis(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mb-6 flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{formatCedis(detail.totalAmount)}</span>
            </div>

            <div className="border-t border-[var(--color-line)] pt-5">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>
                Receipt
              </p>
              <button
                type="button"
                onClick={() => resendReceipt(detail.id)}
                disabled={resending === detail.id || !detail.customerEmail}
                className="admin-button-secondary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resending === detail.id ? "Sending…" : "Email receipt again"}
              </button>
              {!detail.customerEmail && (
                <p className="mt-2 text-xs" style={{ color: "var(--color-ink-soft)" }}>
                  This order has no email address — in-store sales do not collect one.
                </p>
              )}
              {receiptNotice && (
                <p className="mt-2 text-xs" style={{ color: "var(--color-ink-soft)" }}>
                  {receiptNotice}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

type ArchiveItem = {
  id: string;
  completedOrderId: string;
  productName: string;
  productImageUrl: string | null;
  category: string;
  quantity: number;
  price: number;
};

type ArchiveOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerCode: string;
  orderType: string;
  totalAmount: number;
  items: ArchiveItem[];
};

function ArchiveWorkspace() {
  const [orders, setOrders] = useState<ArchiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [type, setType] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ type });
        if (year) params.set("year", String(year));
        if (month) params.set("month", String(month));
        if (search) params.set("search", search);
        const response = await fetch(`/api/admin/orders/archive?${params.toString()}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.message || "Archive could not be loaded.");
        if (!cancelled) setOrders(json.orders || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [type, year, month, search]);

  if (error) return <AdminErrorState description={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="admin-header">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>History</p>
          <h1>Completed orders</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-sm lg:flex-row lg:items-center">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--color-cream)] px-4">
          <Search size={17} style={{ color: "var(--color-ink-soft)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer or code…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-soft)]/60"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {["all", "online", "instore"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold capitalize transition ${
                type === t
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                  : "border-[var(--color-line)] bg-[var(--color-cream)] text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-tint)]"
              }`}
            >
              {t}
            </button>
          ))}
          <AdminSelect value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto px-3 py-2 text-xs">
            {Array.from({ length: 10 }, (_, i) => 2024 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </AdminSelect>
          <AdminSelect value={month || ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : undefined)} className="w-auto px-3 py-2 text-xs">
            <option value="">All months</option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </AdminSelect>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="admin-card admin-card-padding h-20 animate-pulse">
              <div className="h-4 w-32 rounded bg-[var(--color-cream)]" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <AdminEmptyState
          title="No completed orders"
          description="Completed orders are archived here once they reach the completed status."
          icon={<CheckCircle2 size={24} />}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="admin-card admin-card-padding">
              <button
                type="button"
                onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">#{order.orderNumber}</p>
                  <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>{order.customerName} · {order.customerCode}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="admin-badge admin-badge-delivered">{order.orderType}</span>
                  <span className="font-semibold">{formatCedis(order.totalAmount)}</span>
                  <ArrowRight size={16} className={`transition ${expanded === order.id ? "rotate-90" : ""}`} style={{ color: "var(--color-ink-soft)" }} />
                </div>
              </button>
              {expanded === order.id && (
                <div className="mt-4 border-t border-[var(--color-line)] pt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-ink-soft)" }}>Items</p>
                  <ul className="space-y-2">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between rounded-xl bg-[var(--color-cream)] p-3">
                        <div className="flex items-center gap-3">
                          {item.productImageUrl ? (
                            <span className="relative h-10 w-10 overflow-hidden rounded-lg bg-[var(--color-brand-tint)]">
                              <Image src={item.productImageUrl} alt="" fill className="object-cover" sizes="40px" />
                            </span>
                          ) : (
                            <span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--color-brand-tint)]">
                              <Package size={16} style={{ color: "var(--color-brand-deep)" }} />
                            </span>
                          )}
                          <div>
                            <p className="text-sm font-semibold">{item.productName}</p>
                            <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>{item.category} · Qty {item.quantity}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold">{formatCedis(item.price * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
