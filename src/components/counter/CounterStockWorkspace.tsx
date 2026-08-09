"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes } from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminSelect,
  type AdminTableColumn,
} from "@/components/admin/AdminWorkspacePrimitives";
import type { CounterCatalogItem } from "@/domain/counter/catalog";
import {
  ALL_CATEGORIES,
  catalogCategories,
  filterCatalog,
} from "@/domain/counter/catalog-filter";
import { availableStock, stockStatus } from "@/domain/counter/stock";
import { variantLabel } from "@/domain/counter/grouping";
import { AdminHint } from "@/components/admin/AdminHint";
import { formatCedis } from "@/domain/counter/money";

type StockView = "all" | "low" | "out";

const STATUS_LABEL = { out: "Out of stock", low: "Low", healthy: "In stock" } as const;
const STATUS_CLASS = {
  out: "bg-red-100 text-red-800",
  low: "bg-amber-100 text-amber-900",
  healthy: "bg-emerald-100 text-emerald-800",
} as const;

export default function CounterStockWorkspace() {
  const [items, setItems] = useState<CounterCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [view, setView] = useState<StockView>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/counter/stock");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Stock could not be loaded.");
      setItems((payload?.items || []) as CounterCatalogItem[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Stock could not be loaded.");
      setItems([]);
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

  const categories = useMemo(() => catalogCategories(items), [items]);

  const rows = useMemo(() => {
    const matched = filterCatalog(items, { query, category });
    if (view === "all") return matched;
    return matched.filter((item) => stockStatus(availableStock(item)) === view);
  }, [items, query, category, view]);

  const summary = useMemo(() => {
    let low = 0;
    let out = 0;
    for (const item of items) {
      const status = stockStatus(availableStock(item));
      if (status === "low") low += 1;
      if (status === "out") out += 1;
    }
    return { total: items.length, low, out };
  }, [items]);

  const columns: AdminTableColumn<CounterCatalogItem>[] = [
    {
      key: "product",
      header: "Product",
      cell: (row) => (
        <div className="min-w-0">
          <strong className="block truncate">{row.name}</strong>
          <span className="text-xs text-[var(--color-ink-soft)]">{row.sku}</span>
        </div>
      ),
    },
    {
      key: "version",
      label: "Version",
      header: (
        <span className="inline-flex items-center gap-1.5">
          Version
          <AdminHint label="What is Version?">
            Which one of this product it is — the colour and size. A product
            with several versions counts its stock separately for each.
          </AdminHint>
        </span>
      ),
      // Without this column the stock list repeats one product name once per
      // size, and a cashier counting the shelf cannot tell which row is which.
      cell: (row) =>
        row.variantTitle || Object.keys(row.optionValues).length > 0 ? (
          <span className="admin-badge bg-[var(--color-brand-tint)] text-[var(--color-brand-deep)]">
            {variantLabel(row)}
          </span>
        ) : (
          <span className="text-[var(--color-ink-soft)]">—</span>
        ),
    },
    { key: "category", header: "Category", cell: (row) => row.category },
    { key: "price", header: "Price", cell: (row) => formatCedis(row.price) },
    {
      key: "reserved",
      label: "Reserved",
      // "Reserved" is the single most opaque word on this screen. A cashier
      // counting a shelf finds ten items and the till says eight — the
      // difference is stock an online shopper has already paid for and is
      // coming to collect. Without that sentence it reads as a bug.
      header: (
        <span className="inline-flex items-center gap-1.5">
          Reserved
          <AdminHint label="What is Reserved?">
            Already promised to an online order that has been paid for. It is
            still on your shelf, but it is not yours to sell — leave it for the
            customer coming to collect.
          </AdminHint>
        </span>
      ),
      cell: (row) => (row.reserved > 0 ? row.reserved : "—"),
    },
    {
      key: "available",
      label: "Available",
      header: (
        <span className="inline-flex items-center gap-1.5">
          Available
          <AdminHint label="What is Available?">
            What you can actually sell right now — everything on the shelf minus
            anything reserved for an online order.
          </AdminHint>
        </span>
      ),
      cell: (row) => {
        const available = availableStock(row);
        const status = stockStatus(available);
        return (
          <span className={`admin-badge ${STATUS_CLASS[status]}`}>
            {available} · {STATUS_LABEL[status]}
          </span>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-3xl bg-black/5" />
        <div className="h-[28rem] animate-pulse rounded-3xl bg-black/5" />
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
          <h1 className="flex items-center gap-2">
            Stock
            <AdminHint label="What is this screen?">
              Everything this shop carries, including what has run out. Use it
              to check the shelf before promising a customer something.
            </AdminHint>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {summary.total} products · {summary.low} low · {summary.out} out of stock
          </p>
        </div>
      </header>

      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        queryLabel="Search stock"
        placeholder="Search product or SKU…"
      >
        <AdminSelect
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect
          aria-label="Filter by stock level"
          value={view}
          onChange={(event) => setView(event.target.value as StockView)}
        >
          <option value="all">All stock</option>
          <option value="low">Low only</option>
          <option value="out">Out of stock only</option>
        </AdminSelect>
      </AdminFilterBar>

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={<Boxes size={24} />}
          title="Nothing to show"
          description="No product in this shop matches those filters."
        />
      ) : (
        <AdminDataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.variantId || row.productId}
          caption="Stock on hand at this shop"
        />
      )}
    </div>
  );
}
