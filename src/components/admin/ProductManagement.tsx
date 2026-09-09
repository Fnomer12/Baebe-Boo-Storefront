"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Layers,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import {
  filterAdminProducts,
  type AdminInventoryLevel,
  type AdminProduct,
  type AdminProductVariant,
} from "@/domain/admin-products";
import {
  optionKey,
  parseProductOptions,
  variantOptionValues,
  type ProductOption,
} from "@/domain/catalog/product-options";
import { formatCedis } from "@/domain/money";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
} from "@/components/admin/AdminWorkspacePrimitives";
import ProductWizardModal, { type WizardMode } from "@/components/admin/products/ProductWizardModal";

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

function normalizeVariants(value: unknown, productId: string): AdminProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as ApiRecord;
    const compareAt = row.compareAtPrice ?? row.compare_at_price;
    const inventory = normalizeInventory(row.inventory ?? row.inventoryLevels);
    const id = text(row.id);
    return {
      id,
      sku: text(row.sku),
      title: text(row.title, "Default"),
      price: number(row.price),
      compareAtPrice:
        compareAt === null || compareAt === undefined ? null : number(compareAt),
      active: boolean(row.active ?? row.isActive ?? row.is_active, true),
      isDefault: boolean(row.isDefault ?? row.is_default),
      imageUrl: text(row.imageUrl ?? row.image_url),
      optionValues:
        row.optionValues && typeof row.optionValues === "object"
          ? row.optionValues as Record<string, unknown>
          : row.option_values && typeof row.option_values === "object"
            ? row.option_values as Record<string, unknown>
            : {},
      // `variantId` is only set on levels the inventory endpoint returns; the
      // ones nested under a variant know their own parent implicitly.
      inventory: inventory.map((level) => ({
        ...level,
        variantId: level.variantId || id,
      })),
    };
  }).filter((variant) => variant.id && productId);
}

function normalizeProducts(value: unknown): AdminProduct[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as ApiRecord;
    const gallery = Array.isArray(row.gallery)
      ? row.gallery.filter((url): url is string => typeof url === "string")
      : [];
    const id = text(row.id);
    return {
      id,
      name: text(row.name, "Untitled product"),
      description: text(row.description),
      category: text(row.category, "Uncategorised"),
      ageRange: text(row.ageRange ?? row.age_range),
      gender: text(row.gender, "Unisex"),
      price: number(row.price),
      sku: text(row.sku),
      imageUrl: text(row.imageUrl ?? row.image_url),
      gallery,
      active: boolean(row.active ?? row.isActive ?? row.is_active, true),
      featured: boolean(row.featured ?? row.isFeatured ?? row.is_featured),
      createdAt: text(row.createdAt ?? row.created_at),
      // Tolerant on purpose: the server sends a clean array, but the column it
      // comes from is new and a product that predates it must open in the
      // editor as the variable product its variants say it is.
      options: parseProductOptions(row.options),
      variants: normalizeVariants(row.variants, id),
    };
  }).filter((product) => product.id);
}

export default function ProductManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ mode: WizardMode; productId: string | null } | null>(null);

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
      // One request. The separate `/api/admin/inventory?limit=500` this used to
      // fire alongside it was both redundant — every product already arrives
      // with its variants' stock levels attached — and quietly wrong: it
      // truncated at 500 rows, so on a catalogue of any size the merge blanked
      // the stock of every variant past the cut-off.
      const response = await fetch(`/api/admin/products?${parameters}`, { cache: "no-store" });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.message || "The product catalog is not available yet.");
      }
      const payload = await response.json() as ProductResponse;
      const nextProducts = normalizeProducts(payload.products);
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

  // `/BaebeAdmin/upload` is now a redirect to here, so every old bookmark and
  // the workspace alias map arrive as `?new=1` and open the wizard on their own.
  // Derived rather than pushed into state by an effect: an effect would fire a
  // second render before the modal appeared, and would reopen the form every
  // time anything else on the page re-rendered with the parameter still set.
  const wantsNewProduct = searchParams.get("new") === "1";
  const activeEditor = editor ?? (wantsNewProduct ? { mode: "create" as const, productId: null } : null);

  function closeEditor() {
    setEditor(null);
    // The parameter goes with the form, or closing and reopening the page
    // would put the seller back in front of a blank product.
    if (wantsNewProduct) router.replace("/BaebeAdmin/products");
  }

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category))].sort(),
    [products],
  );
  const visibleProducts = useMemo(
    () => filterAdminProducts(products, { query, status, category }),
    [category, products, query, status],
  );
  const selected = products.find((product) => product.id === selectedId) ?? null;
  const beingEdited = products.find((product) => product.id === activeEditor?.productId) ?? null;
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
          <div className="ml-auto flex w-fit flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push("/BaebeAdmin/products/labels")}
              className="flex min-h-11 items-center gap-2 rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-sm font-semibold text-black/70 shadow-sm transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2"
            >
              <Printer size={16} />
              Print labels
            </button>
            <button
              type="button"
              onClick={() => setEditor({ mode: "create", productId: null })}
              className="flex min-h-11 items-center gap-2 rounded-2xl bg-[#101820] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d2b36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2"
            >
              <Plus size={16} />
              Add product
            </button>
          </div>
          <StoreLiveToggle />
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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <ProductList
            products={visibleProducts}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selected && (
            <ProductDetail
              product={selected}
              onSaved={load}
              onEdit={(mode) => setEditor({ mode, productId: selected.id })}
            />
          )}
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

      {/* Mounted only while it is open, and keyed per session: the wizard seeds
          every field from these props once, so "reopen" has to mean a fresh
          component rather than an effect racing the catalogue's next refresh. */}
      {activeEditor && (
        <ProductWizardModal
          key={`${activeEditor.mode}:${activeEditor.productId ?? "new"}`}
          mode={activeEditor.mode}
          product={beingEdited}
          onClose={closeEditor}
          onSaved={load}
        />
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

/**
 * The "Store live" switch.
 *
 * Off = every visitor to the main website sees a banner that the store is
 * still getting ready. On = no banner. A missing/unreadable setting reads as
 * live, so the shop never alarms customers over an unapplied migration — the
 * switch simply shows an error instead of flipping.
 */
function StoreLiveToggle() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/store-settings", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!cancelled && response.ok && typeof payload?.storeReady === "boolean") {
          setReady(payload.storeReady);
        } else if (!cancelled) {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function flip() {
    if (ready === null || saving) return;
    const next = !ready;
    setSaving(true);
    setFailed(false);
    try {
      const response = await fetch("/api/admin/store-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeReady: next }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.storeReady !== "boolean") throw new Error("save failed");
      setReady(payload.storeReady);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ml-auto flex w-fit flex-col gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={ready === true}
        aria-label="Store live"
        title={
          ready === false
            ? "Store is hidden behind a “getting ready” banner. Switch on to go live."
            : "Store is live. Switch off to show a “getting ready” banner."
        }
        onClick={() => void flip()}
        disabled={ready === null || saving}
        className={`flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
          ready === false
            ? "border-amber-300 bg-amber-100 text-amber-900"
            : "border-black/[0.07] bg-white text-black/70 hover:bg-black/[0.03]"
        }`}
      >
        <Store size={16} aria-hidden="true" />
        {ready === null ? "Store status…" : ready ? "Store live" : "Not ready — banner on"}
        <span
          aria-hidden="true"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
            ready ? "bg-emerald-500" : "bg-black/20"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
              ready ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
      {failed && (
        <p role="alert" className="text-right text-xs font-medium text-red-700">
          Store status could not be {ready === null ? "loaded" : "saved"}. Try again.
        </p>
      )}
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
              <span className="hidden text-sm font-semibold sm:block">{formatCedis(product.price)}</span>
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
  onEdit,
}: {
  product: AdminProduct;
  onSaved: () => Promise<void>;
  onEdit: (mode: WizardMode) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const options = product.options ?? [];

  async function archiveOrRestore() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.active }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not update this product.");
      setMessage(product.active ? "Product archived." : "Product restored.");
      await onSaved();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeatured() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: !product.featured }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not update this product.");
      setMessage(
        product.featured
          ? "Removed from the homepage."
          : "This product now appears on the homepage.",
      );
      await onSaved();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteForever() {
    if (
      !window.confirm(
        `Delete "${product.name}" permanently? This removes the product, its versions and stock records, and cannot be undone. Use Archive to retire a product you have sold.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
      });
      const payload = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not delete this product.");
      await onSaved();
    } catch (deleteError) {
      setMessage(
        deleteError instanceof Error ? deleteError.message : "Could not delete this product.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="h-fit rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm xl:sticky xl:top-8">
      <div>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            product.active ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/45"
          }`}>
            {product.active ? "Active" : "Archived"}
          </span>
          {product.featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              <Star size={10} /> Featured
            </span>
          )}
        </span>
        <h2 className="mt-3 text-xl font-semibold">{product.name}</h2>
        <p className="mt-1 text-xs text-black/45">{product.sku || product.variants[0]?.sku || "No SKU"}</p>
      </div>

      {/* Two doors, because they are two different saves. Details is a PATCH
          that cannot touch a variable product's price at all; versions is a
          full replace of the option list and the grid. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onEdit("details")}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-3 text-sm font-semibold"
        >
          <Pencil size={15} /> Edit details
        </button>
        <button
          type="button"
          onClick={() => onEdit("versions")}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-3 text-sm font-semibold"
        >
          <Layers size={15} /> Edit versions &amp; stock
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Detail label="Category" value={product.category} />
        <Detail label="Age" value={product.ageRange || "Not set"} />
        <Detail label="Gender" value={product.gender} />
        <Detail
          label={options.length > 0 ? "From" : "Price"}
          value={formatCedis(product.price)}
        />
      </dl>

      <div className="mt-6 border-t border-black/[0.07] pt-5">
        <div className="flex items-center gap-2">
          <Boxes size={17} />
          <h3 className="font-semibold">Versions and branch inventory</h3>
        </div>
        <div className="mt-3 space-y-4">
          {product.variants.length ? product.variants.map((variant) => (
            <VariantInventory
              key={variant.id}
              variant={variant}
              options={options}
              onSaved={onSaved}
            />
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
        onClick={() => void toggleFeatured()}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 text-sm font-semibold disabled:opacity-50"
      >
        <Star size={16} className={product.featured ? "fill-amber-400 text-amber-400" : ""} />
        {product.featured ? "Remove from homepage" : "Feature on homepage"}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => void archiveOrRestore()}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 text-sm font-semibold disabled:opacity-50"
      >
        {product.active ? <Archive size={16} /> : <RotateCcw size={16} />}
        {product.active ? "Archive product" : "Restore product"}
      </button>
      {/* Delete is refused server-side once the product has sold or been
          ordered from a supplier — this button is for test rows and typos. */}
      <button
        type="button"
        disabled={saving}
        onClick={() => void deleteForever()}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 size={16} />
        Delete permanently
      </button>
      {message && <p role="status" className="mt-3 text-center text-xs text-black/55">{message}</p>}
    </aside>
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

/**
 * The read-only summary in the aside.
 *
 * Chips rather than `variant.title`, because `title` is whatever was written
 * when the row was created and older ones carry the entire product name — the
 * exact string that used to render as an unreadable size chip on the
 * storefront. The chips are built from the option values instead, in the order
 * the product declares its options.
 */
function VariantInventory({
  variant,
  options,
  onSaved,
}: {
  variant: AdminProductVariant;
  options: readonly ProductOption[];
  onSaved: () => Promise<void>;
}) {
  const values = variantOptionValues(variant);
  const keys = options.length > 0 ? options.map((option) => optionKey(option.name)) : Object.keys(values);
  const chips = keys.map((key) => values[key]).filter(Boolean);

  return (
    <section className="rounded-2xl bg-[#f6f7f9] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {chips.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {chips.map((value) => (
                <span key={value} className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
                  {value}
                </span>
              ))}
            </span>
          ) : (
            <strong className="block text-sm">Only version</strong>
          )}
          <small className="mt-1 block text-[11px] text-black/45">
            {variant.sku} · {formatCedis(variant.price)}
            {variant.active ? "" : " · switched off"}
          </small>
        </div>
        {variant.isDefault && <CircleCheck size={16} className="text-emerald-600" aria-label="Shown first" />}
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
        <button type="button" onClick={() => setEditing((current) => !current)} className="min-h-11 text-xs font-semibold text-[#28637d]">
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
    <div aria-label="Loading products" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="h-[32rem] animate-pulse rounded-3xl bg-black/5" />
      <div className="h-[28rem] animate-pulse rounded-3xl bg-black/5" />
    </div>
  );
}
