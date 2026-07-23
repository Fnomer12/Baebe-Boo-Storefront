"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  filterAdminProducts,
  type AdminInventoryLevel,
  type AdminProduct,
  type AdminProductVariant,
} from "@/domain/admin-products";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
} from "@/components/admin/AdminWorkspacePrimitives";

type ApiRecord = Record<string, unknown>;
type ProductResponse = {
  products?: unknown;
  page?: unknown;
  pageSize?: unknown;
  total?: unknown;
};

const pageSize = 24;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeInventory(value: unknown): AdminInventoryLevel[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as ApiRecord;
    const onHand = number(row.onHand ?? row.on_hand);
    const reserved = number(row.reserved);
    return {
      id: text(row.id),
      variantId: text(row.variantId ?? row.variant_id),
      shopId: text(row.shopId ?? row.shop_id),
      shopName: text(row.shopName ?? row.shop_name, "Branch"),
      shopLocation: text(row.shopLocation ?? row.shop_location),
      onHand,
      reserved,
      available: number(row.available, Math.max(0, onHand - reserved)),
      reorderPoint: number(row.reorderPoint ?? row.reorder_point),
      updatedAt: text(row.updatedAt ?? row.updated_at),
    };
  }).filter((item) => item.id);
}

function normalizeVariants(value: unknown): AdminProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as ApiRecord;
    return {
      id: text(row.id),
      sku: text(row.sku),
      title: text(row.title, "Default"),
      price: number(row.price),
      active: boolean(row.active ?? row.isActive ?? row.is_active, true),
      isDefault: boolean(row.isDefault ?? row.is_default),
      optionValues:
        row.optionValues && typeof row.optionValues === "object"
          ? row.optionValues as Record<string, unknown>
          : row.option_values && typeof row.option_values === "object"
            ? row.option_values as Record<string, unknown>
            : {},
      inventory: normalizeInventory(row.inventory ?? row.inventoryLevels),
    };
  }).filter((variant) => variant.id);
}

function normalizeProducts(value: unknown): AdminProduct[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as ApiRecord;
    return {
      id: text(row.id),
      name: text(row.name, "Untitled product"),
      description: text(row.description),
      category: text(row.category, "Uncategorised"),
      ageRange: text(row.ageRange ?? row.age_range),
      gender: text(row.gender, "Unisex"),
      price: number(row.price),
      sku: text(row.sku),
      imageUrl: text(row.imageUrl ?? row.image_url),
      active: boolean(row.active ?? row.isActive ?? row.is_active, true),
      createdAt: text(row.createdAt ?? row.created_at),
      variants: normalizeVariants(row.variants),
    };
  }).filter((product) => product.id);
}

function attachInventory(products: AdminProduct[], value: unknown) {
  if (!Array.isArray(value)) return products;
  const records = value as ApiRecord[];
  return products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      inventory: normalizeInventory(
        records.filter((record) =>
          text(record.variantId ?? record.variant_id) === variant.id,
        ),
      ),
    })),
  }));
}

export default function ProductManagement() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const parameters = new URLSearchParams({
        query,
        status,
        page: String(page),
        pageSize: String(pageSize),
      });
      const [productResponse, inventoryResponse] = await Promise.all([
        fetch(`/api/admin/products?${parameters}`, { cache: "no-store" }),
        fetch("/api/admin/inventory?limit=500", { cache: "no-store" }),
      ]);
      if (!productResponse.ok) {
        const failure = await productResponse.json().catch(() => null);
        throw new Error(failure?.message || "The product catalog is not available yet.");
      }
      const payload = await productResponse.json() as ProductResponse;
      let nextProducts = normalizeProducts(payload.products);
      if (inventoryResponse.ok) {
        const inventoryPayload = await inventoryResponse.json() as { inventory?: unknown };
        nextProducts = attachInventory(nextProducts, inventoryPayload.inventory);
      }
      setProducts(nextProducts);
      setTotal(number(payload.total, nextProducts.length));
      setSelectedId((current) =>
        current && nextProducts.some((product) => product.id === current)
          ? current
          : nextProducts[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  const visibleProducts = useMemo(
    () => filterAdminProducts(products, { query, status, category }),
    [category, products, query, status],
  );
  const selected = products.find((product) => product.id === selectedId) ?? null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">
            Catalog operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Products
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
            Search the national catalog, review variants, update product details
            and manage branch stock without leaving this workspace.
          </p>
        </div>
        <div className="space-y-3">
          <Link href="/BaebeAdmin/upload" className="ml-auto flex w-fit items-center gap-2 rounded-2xl bg-[#101820] px-4 py-3 text-sm font-semibold text-white">
            <Plus size={16} />
            Add product
          </Link>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Products" value={total} />
            <Metric label="Active" value={products.filter((product) => product.active).length} />
            <Metric
              label="Low stock"
              value={products.flatMap((product) => product.variants)
                .flatMap((variant) => variant.inventory)
                .filter((level) => level.available <= level.reorderPoint).length}
            />
          </div>
        </div>
      </header>

      <AdminFilterBar
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        queryLabel="Search products by name or SKU"
        placeholder="Search products or SKUs…"
      >
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value as typeof status);
            setPage(1);
          }}
          options={[
            ["all", "All statuses"],
            ["active", "Active"],
            ["archived", "Archived"],
          ]}
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={[["all", "All categories"], ...categories.map((item) => [item, item])]}
        />
      </AdminFilterBar>

      {error ? (
        <AdminErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState />
      ) : visibleProducts.length === 0 ? (
        <AdminEmptyState
          title="No products found"
          description="Adjust the search or filters to see more of the catalog."
          icon={<Package size={24} />}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <ProductList
            products={visibleProducts}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selected && <ProductDetail product={selected} onSaved={load} />}
        </div>
      )}

      {!error && total > pageSize && (
        <nav aria-label="Product pages" className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white disabled:opacity-35"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="text-sm text-black/55">Page {page} of {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white disabled:opacity-35"
          >
            <ChevronRight size={17} />
          </button>
        </nav>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-2xl border border-black/[0.07] bg-white px-3 py-3 shadow-sm">
      <strong className="block text-lg">{value}</strong>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-black/40">{label}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-black/[0.07] px-3">
      <SlidersHorizontal size={15} className="text-black/35" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent text-sm outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ProductList({
  products,
  selectedId,
  onSelect,
}: {
  products: AdminProduct[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Product catalog" className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-sm">
      <div className="divide-y divide-black/[0.06]">
        {products.map((product) => {
          const available = product.variants
            .flatMap((variant) => variant.inventory)
            .reduce((sum, level) => sum + level.available, 0);
          return (
            <button
              type="button"
              key={product.id}
              onClick={() => onSelect(product.id)}
              aria-pressed={selectedId === product.id}
              className={`grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition sm:grid-cols-[4rem_minmax(0,1fr)_7rem_6rem] ${
                selectedId === product.id ? "bg-[#eaf6fb]" : "hover:bg-[#f8fafb]"
              }`}
            >
              <ProductImage product={product} />
              <span className="min-w-0">
                <strong className="block truncate text-sm">{product.name}</strong>
                <small className="mt-1 block truncate text-xs text-black/45">
                  {product.sku || product.variants[0]?.sku || "No SKU"} · {product.category}
                </small>
              </span>
              <span className="hidden text-sm font-semibold sm:block">GH₵{product.price.toLocaleString()}</span>
              <span className="text-right">
                <strong className="block text-sm">{available}</strong>
                <small className="text-[10px] uppercase tracking-wide text-black/40">available</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProductImage({ product }: { product: AdminProduct }) {
  return (
    <span className="relative grid aspect-square overflow-hidden rounded-2xl bg-[#eef1f3] text-sm font-bold text-black/35">
      {product.imageUrl ? (
        <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" />
      ) : (
        <span className="m-auto">{product.name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

function ProductDetail({
  product,
  onSaved,
}: {
  product: AdminProduct;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function updateProduct(body: ApiRecord, method = "PATCH") {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not update this product.");
      setEditing(false);
      setMessage("Product saved.");
      await onSaved();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="h-fit rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm xl:sticky xl:top-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            product.active ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/45"
          }`}>
            {product.active ? "Active" : "Archived"}
          </span>
          <h2 className="mt-3 text-xl font-semibold">{product.name}</h2>
          <p className="mt-1 text-xs text-black/45">{product.sku || product.variants[0]?.sku || "No SKU"}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((current) => !current)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fb] text-[#28637d]"
          aria-label={editing ? "Close product editor" : "Edit product"}
        >
          {editing ? <X size={17} /> : <Pencil size={17} />}
        </button>
      </div>

      {editing ? (
        <ProductEditForm
          product={product}
          saving={saving}
          onSubmit={(patch) => void updateProduct(patch)}
        />
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Detail label="Category" value={product.category} />
          <Detail label="Age" value={product.ageRange || "Not set"} />
          <Detail label="Gender" value={product.gender} />
          <Detail label="Price" value={`GH₵${product.price.toLocaleString()}`} />
        </dl>
      )}

      <div className="mt-6 border-t border-black/[0.07] pt-5">
        <div className="flex items-center gap-2">
          <Boxes size={17} />
          <h3 className="font-semibold">Variants and branch inventory</h3>
        </div>
        <div className="mt-3 space-y-4">
          {product.variants.length ? product.variants.map((variant) => (
            <VariantInventory key={variant.id} variant={variant} onSaved={onSaved} />
          )) : (
            <p className="rounded-2xl bg-[#f6f7f9] p-4 text-xs leading-5 text-black/50">
              No variant inventory has been configured yet.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={() => void updateProduct(
          product.active ? {} : { isActive: true },
          product.active ? "DELETE" : "PATCH",
        )}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 text-sm font-semibold disabled:opacity-50"
      >
        {product.active ? <Archive size={16} /> : <RotateCcw size={16} />}
        {product.active ? "Archive product" : "Restore product"}
      </button>
      {message && <p role="status" className="mt-3 text-center text-xs text-black/55">{message}</p>}
    </aside>
  );
}

function ProductEditForm({
  product,
  saving,
  onSubmit,
}: {
  product: AdminProduct;
  saving: boolean;
  onSubmit: (patch: ApiRecord) => void;
}) {
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          name: text(data.get("name")),
          description: text(data.get("description")),
          category: text(data.get("category")),
          ageRange: text(data.get("ageRange")),
          gender: text(data.get("gender")),
          sku: text(data.get("sku")) || undefined,
          price: number(data.get("price")),
          imageUrl: product.imageUrl,
        });
      }}
    >
      <EditorField label="Name" name="name" defaultValue={product.name} required />
      <div className="grid grid-cols-2 gap-3">
        <EditorField label="Category" name="category" defaultValue={product.category} required />
        <EditorField label="SKU" name="sku" defaultValue={product.sku} />
        <EditorField label="Age range" name="ageRange" defaultValue={product.ageRange} required />
        <EditorField label="Gender" name="gender" defaultValue={product.gender} required />
      </div>
      <EditorField label="Price (GH₵)" name="price" type="number" min="0" step="0.01" defaultValue={String(product.price)} required />
      <label className="block text-xs font-semibold text-black/50">
        Description
        <textarea name="description" defaultValue={product.description} rows={3} className="mt-1.5 w-full rounded-2xl border border-black/10 px-3 py-2.5 text-sm font-normal outline-none focus:border-black/35" />
      </label>
      <button type="submit" disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#101820] text-sm font-semibold text-white disabled:opacity-50">
        <Save size={16} /> {saving ? "Saving…" : "Save product"}
      </button>
    </form>
  );
}

function EditorField({
  label,
  name,
  ...inputProps
}: {
  label: string;
  name: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-xs font-semibold text-black/50">
      {label}
      <input name={name} {...inputProps} className="mt-1.5 h-10 w-full rounded-xl border border-black/10 px-3 text-sm font-normal outline-none focus:border-black/35" />
    </label>
  );
}

function VariantInventory({
  variant,
  onSaved,
}: {
  variant: AdminProductVariant;
  onSaved: () => Promise<void>;
}) {
  return (
    <section className="rounded-2xl bg-[#f6f7f9] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <strong className="block text-sm">{variant.title}</strong>
          <small className="text-[11px] text-black/45">{variant.sku}</small>
        </div>
        {variant.isDefault && <CircleCheck size={16} className="text-emerald-600" aria-label="Default variant" />}
      </div>
      <div className="mt-3 space-y-2">
        {variant.inventory.map((level) => (
          <InventoryLevel key={level.id} level={level} onSaved={onSaved} />
        ))}
      </div>
    </section>
  );
}

function InventoryLevel({
  level,
  onSaved,
}: {
  level: AdminInventoryLevel;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">
          <strong className="block truncate text-xs">{level.shopName}</strong>
          <small className="block truncate text-[10px] text-black/40">{level.shopLocation}</small>
        </span>
        <button type="button" onClick={() => setEditing((current) => !current)} className="text-xs font-semibold text-[#28637d]">
          {editing ? "Cancel" : "Adjust"}
        </button>
      </div>
      {!editing ? (
        <div className="mt-2 flex gap-3 text-[11px] text-black/50">
          <span><b className="text-black">{level.onHand}</b> on hand</span>
          <span><b className="text-black">{level.reserved}</b> reserved</span>
          <span><b className="text-black">{level.available}</b> available</span>
        </div>
      ) : (
        <form
          className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError("");
            const data = new FormData(event.currentTarget);
            try {
              const response = await fetch(
                `/api/admin/inventory/${level.variantId}/${level.shopId}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    onHand: number(data.get("onHand")),
                    reorderPoint: number(data.get("reorderPoint")),
                  }),
                },
              );
              const payload = await response.json().catch(() => null);
              if (!response.ok) throw new Error(payload?.message || "Could not update inventory.");
              setEditing(false);
              await onSaved();
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "Could not update inventory.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <EditorField label="On hand" name="onHand" type="number" min={level.reserved} defaultValue={String(level.onHand)} required />
          <EditorField label="Reorder at" name="reorderPoint" type="number" min="0" defaultValue={String(level.reorderPoint)} required />
          <button type="submit" disabled={saving} aria-label={`Save inventory for ${level.shopName}`} className="mt-[1.45rem] grid h-10 w-10 place-items-center rounded-xl bg-[#101820] text-white disabled:opacity-50">
            <Save size={15} />
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-[11px] text-red-700">{error}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f6f7f9] p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">{label}</dt>
      <dd className="mt-1 truncate font-semibold">{value}</dd>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-label="Loading products" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="h-[32rem] animate-pulse rounded-3xl bg-black/5" />
      <div className="h-[28rem] animate-pulse rounded-3xl bg-black/5" />
    </div>
  );
}
