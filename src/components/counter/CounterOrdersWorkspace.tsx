"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageCheck } from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
} from "@/components/admin/AdminWorkspacePrimitives";
import { formatCedis } from "@/domain/counter/money";

type CounterHandoverOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: string;
  placedAt: string;
  lines: { id: string; productName: string; quantity: number }[];
};

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CounterOrdersWorkspace() {
  const [orders, setOrders] = useState<CounterHandoverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/counter/orders");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "Collection orders could not be loaded.");
      }
      setOrders((payload?.orders || []) as CounterHandoverOrder[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Collection orders could not be loaded.",
      );
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const collect = async (order: CounterHandoverOrder) => {
    const confirmed = window.confirm(
      `Hand ${order.orderNumber || "this order"} to ${order.customerName}? This closes the order.`,
    );
    if (!confirmed) return;

    setCollectingId(order.id);
    setError("");
    try {
      const response = await fetch(`/api/counter/orders/${order.id}`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The order could not be handed over.");
      }
      setOrders((current) => current.filter((row) => row.id !== order.id));
      setNotice(`${order.orderNumber || "Order"} handed to ${order.customerName}.`);
    } catch (collectError) {
      setError(
        collectError instanceof Error
          ? collectError.message
          : "The order could not be handed over.",
      );
    } finally {
      setCollectingId(null);
    }
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) =>
      `${order.orderNumber} ${order.customerName} ${order.customerPhone}`
        .toLowerCase()
        .includes(needle),
    );
  }, [orders, query]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-3xl bg-black/5" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-3xl bg-black/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error && orders.length === 0) {
    return <AdminErrorState description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <header className="admin-header">
        <div>
          <h1>Orders</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Paid online orders waiting to be collected from this shop.
          </p>
        </div>
      </header>

      {notice && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {error}
        </p>
      )}

      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search collection orders"
        placeholder="Search order, customer or phone…"
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={<PackageCheck size={24} />}
          title="Nothing waiting"
          description="No paid click-and-collect order is waiting at this shop right now."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((order) => (
            <article key={order.id} className="admin-card admin-card-padding">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{order.orderNumber || "Order"}</h2>
                  <p className="text-sm text-[var(--color-ink-soft)]">{order.customerName}</p>
                  {order.customerPhone && (
                    <p className="text-sm text-[var(--color-ink-soft)]">{order.customerPhone}</p>
                  )}
                </div>
                <span className="admin-badge admin-badge-paid">Paid</span>
              </div>

              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                Placed {formatDate(order.placedAt)}
              </p>

              <ul className="mt-3 space-y-1 border-t border-[var(--color-line)] pt-3 text-sm">
                {order.lines.length === 0 && (
                  <li className="text-[var(--color-ink-soft)]">No line detail recorded.</li>
                )}
                {order.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{line.productName}</span>
                    <span className="shrink-0 font-semibold">× {line.quantity}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-4">
                <strong className="text-xl">{formatCedis(order.total)}</strong>
                <button
                  type="button"
                  onClick={() => void collect(order)}
                  disabled={collectingId === order.id}
                  className="admin-button min-h-[3rem] disabled:opacity-50"
                >
                  <PackageCheck size={17} />
                  {collectingId === order.id ? "Handing over…" : "Mark collected"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
