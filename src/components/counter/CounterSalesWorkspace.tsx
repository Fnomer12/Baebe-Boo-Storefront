"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, ReceiptText } from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminModal,
  type AdminTableColumn,
} from "@/components/admin/AdminWorkspacePrimitives";
import { formatCedis } from "@/domain/counter/money";

type CounterSaleSummary = {
  id: string;
  orderNumber: string;
  customerName: string;
  paymentMethod: string;
  total: number;
  soldAt: string;
  isMine: boolean;
};

type CounterSaleReceipt = CounterSaleSummary & {
  customerPhone: string;
  lines: { id: string; productName: string; variantLabel?: string; quantity: number; price: number; lineTotal: number }[];
};

type SalesDigest = {
  sales: CounterSaleSummary[];
  todayTotal: number;
  todayCount: number;
  myTodayTotal: number;
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  visa: "Card",
  momo: "Mobile money",
};

function formatTime(value: string) {
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

export default function CounterSalesWorkspace() {
  const [digest, setDigest] = useState<SalesDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [receipt, setReceipt] = useState<CounterSaleReceipt | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/counter/sales");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Sales could not be loaded.");
      setDigest(payload as SalesDigest);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Sales could not be loaded.");
      setDigest(null);
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

  const openReceipt = async (saleId: string) => {
    setReceiptLoadingId(saleId);
    setReceiptError("");
    try {
      const response = await fetch(`/api/counter/sales/${saleId}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "The receipt could not be loaded.");
      setReceipt(payload?.sale as CounterSaleReceipt);
    } catch (openError) {
      setReceiptError(
        openError instanceof Error ? openError.message : "The receipt could not be loaded.",
      );
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const rows = useMemo(() => {
    const sales = digest?.sales || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter((sale) =>
      `${sale.orderNumber} ${sale.customerName}`.toLowerCase().includes(needle),
    );
  }, [digest, query]);

  const columns: AdminTableColumn<CounterSaleSummary>[] = [
    {
      key: "order",
      header: "Sale",
      cell: (row) => (
        <div className="min-w-0">
          <strong className="block truncate">{row.orderNumber || "—"}</strong>
          <span className="text-xs text-[var(--color-ink-soft)]">{row.customerName}</span>
        </div>
      ),
    },
    { key: "soldAt", header: "Time", cell: (row) => formatTime(row.soldAt) },
    {
      key: "payment",
      header: "Payment",
      cell: (row) => PAYMENT_LABEL[row.paymentMethod] || row.paymentMethod,
    },
    {
      key: "cashier",
      header: "Cashier",
      cell: (row) =>
        row.isMine ? (
          <span className="admin-badge bg-emerald-100 text-emerald-800">Me</span>
        ) : (
          <span className="text-xs text-[var(--color-ink-soft)]">Colleague</span>
        ),
    },
    { key: "total", header: "Total", cell: (row) => formatCedis(row.total) },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <button
          type="button"
          onClick={() => void openReceipt(row.id)}
          disabled={receiptLoadingId === row.id}
          className="admin-button admin-button-secondary disabled:opacity-50"
        >
          {receiptLoadingId === row.id ? "Opening…" : "Receipt"}
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-3xl bg-black/5" />
          ))}
        </div>
        <div className="h-[26rem] animate-pulse rounded-3xl bg-black/5" />
      </div>
    );
  }

  if (error) {
    return <AdminErrorState description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4">
      <header className="admin-header">
        <div>
          <h1>Sales</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            In-store sales rung up at this shop.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Today&rsquo;s takings</span>
          <strong>{formatCedis(digest?.todayTotal || 0)}</strong>
        </div>
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Sales today</span>
          <strong>{digest?.todayCount || 0}</strong>
        </div>
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Rung up by me</span>
          <strong>{formatCedis(digest?.myTodayTotal || 0)}</strong>
        </div>
      </div>

      {receiptError && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          {receiptError}
        </p>
      )}

      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search sales"
        placeholder="Search sale number or customer…"
      />

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={<ReceiptText size={24} />}
          title="No sales yet"
          description="Sales rung up at this counter will appear here with their receipts."
        />
      ) : (
        <AdminDataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          caption="In-store sales at this shop"
        />
      )}

      <AdminModal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        subtitle="Receipt"
        title={receipt?.orderNumber || "Sale"}
      >
        {receipt && (
          <div className="space-y-4">
            <div className="text-sm">
              <p className="font-bold">{receipt.customerName}</p>
              {receipt.customerPhone && (
                <p className="text-[var(--color-ink-soft)]">{receipt.customerPhone}</p>
              )}
              <p className="text-[var(--color-ink-soft)]">{formatTime(receipt.soldAt)}</p>
            </div>

            <ul className="divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
              {receipt.lines.map((line) => (
                <li key={line.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {line.productName}
                      {line.variantLabel ? (
                        <span className="font-normal text-[var(--color-ink-soft)]"> · {line.variantLabel}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {line.quantity} × {formatCedis(line.price)}
                    </span>
                  </span>
                  <span className="font-semibold">{formatCedis(line.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between">
              <span className="admin-label mb-0">
                {PAYMENT_LABEL[receipt.paymentMethod] || receipt.paymentMethod}
              </span>
              <strong className="text-2xl">{formatCedis(receipt.total)}</strong>
            </div>

            <a
              href={`/api/counter/sales/${receipt.id}/receipt/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-button flex min-h-12 w-full items-center justify-center gap-2"
            >
              <Printer size={18} /> Print receipt (80 mm roll)
            </a>
            <p className="text-xs leading-5 text-[var(--color-ink-soft)]">
              Prints a 72 mm receipt for the thermal printer in receipt mode. Use actual size,
              never fit-to-page.
            </p>
          </div>
        )}
      </AdminModal>
    </div>
  );
}
