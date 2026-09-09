"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminSelect,
} from "@/components/admin/AdminWorkspacePrimitives";
import type {
  CounterCartLine,
  CounterCatalogItem,
  CounterPaymentMethod,
} from "@/domain/counter/catalog";
import {
  addCartLine,
  cartTotals,
  removeCartLine,
  setCartQuantity,
  soldQuantitiesByVariant,
  toSaleItems,
} from "@/domain/counter/cart";
import {
  ALL_AGE_RANGES,
  ALL_CATEGORIES,
  catalogAgeRanges,
  catalogCategories,
  filterCatalog,
  paginate,
} from "@/domain/counter/catalog-filter";
import { applySoldQuantities } from "@/domain/counter/stock";
import {
  groupCatalogByProduct,
  soleSellableVariant,
  type CounterProductGroup,
} from "@/domain/counter/grouping";
import { formatCedis } from "@/domain/counter/money";
import CounterCartPanel from "./CounterCartPanel";
import CounterProductCard from "./CounterProductCard";
import CounterVariantPicker from "./CounterVariantPicker";
import CounterReceiptPrintModal, { type CounterReceiptForPrint } from "./CounterReceiptPrintModal";
import { AdminHint } from "@/components/admin/AdminHint";

const PAGE_SIZE = 12;

export default function SellWorkspace() {
  const [items, setItems] = useState<CounterCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [lines, setLines] = useState<CounterCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CounterPaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerUserId, setCustomerUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [completedCashReceipt, setCompletedCashReceipt] = useState<CounterReceiptForPrint | null>(null);
  /**
   * One key per cart. It survives re-renders and failed attempts, so a retry
   * after a dropped response replays the same sale rather than ringing up a
   * second one. A fresh key is minted only once a sale actually lands.
   */
  const [saleKey, setSaleKey] = useState(newSaleKey);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [ageRange, setAgeRange] = useState(ALL_AGE_RANGES);
  const [page, setPage] = useState(1);
  /** Product whose version picker is open. Held by id, not by object, so the
   *  sheet keeps showing live stock as sales come through. */
  const [pickerProductId, setPickerProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // No shop parameter: the server derives it from the session.
      const response = await fetch("/api/counter/catalog");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The catalogue could not be loaded.");
      }
      setItems((payload?.items || []) as CounterCatalogItem[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The catalogue could not be loaded.");
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
  const ageRanges = useMemo(() => catalogAgeRanges(items), [items]);

  const filtered = useMemo(
    () => filterCatalog(items, { query, category, ageRange }),
    [items, query, category, ageRange],
  );
  // Group AFTER filtering, so searching "pink" narrows a product to just its
  // pink versions rather than showing the whole product because one version
  // matched.
  const groups = useMemo(() => groupCatalogByProduct(filtered), [filtered]);
  const pageResult = useMemo(
    () => paginate(groups, page, PAGE_SIZE),
    [groups, page],
  );

  const quantityByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.variantId, line.quantity);
    return map;
  }, [lines]);

  /** Units of a product in the cart, summed across all of its versions. */
  const quantityByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(line.productId, (map.get(line.productId) || 0) + line.quantity);
    }
    return map;
  }, [lines]);

  const itemsByVariantId = useMemo(() => {
    const map = new Map<string, CounterCatalogItem>();
    for (const item of items) if (item.variantId) map.set(item.variantId, item);
    return map;
  }, [items]);

  // Re-read the open group from the live list so its stock counts stay correct
  // after a sale rather than freezing at whatever they were when it opened.
  const pickerGroup = useMemo(
    () => (pickerProductId ? groups.find((g) => g.productId === pickerProductId) ?? null : null),
    [groups, pickerProductId],
  );

  const addVariant = useCallback(
    (variantId: string) => {
      const item = itemsByVariantId.get(variantId);
      if (item) setLines((current) => addCartLine(current, item));
    },
    [itemsByVariantId],
  );

  const totals = cartTotals(lines);

  const completeSale = async () => {
    setSubmitting(true);
    setSaleError("");
    try {
      const response = await fetch("/api/counter/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: toSaleItems(lines),
          paymentMethod,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          customerUserId: customerUserId || undefined,
          idempotencyKey: saleKey,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The sale could not be completed.");
      }

      setItems((current) => applySoldQuantities(current, soldQuantitiesByVariant(lines)));
      const sale = payload?.sale as CounterReceiptForPrint;
      if (paymentMethod === "cash" && sale?.id) {
        setCompletedCashReceipt(sale);
        setNotice("");
      } else {
        setNotice(
          `Sale ${sale?.orderNumber || ""} completed · ${formatCedis(totals.total)}`.trim(),
        );
      }
      setLines([]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerUserId(null);
      setCartOpen(false);
      setSaleKey(newSaleKey());
    } catch (completeError) {
      setSaleError(
        completeError instanceof Error
          ? completeError.message
          : "The sale could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-3xl bg-black/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: PAGE_SIZE }, (_, index) => (
            <div key={index} className="h-72 animate-pulse rounded-3xl bg-black/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <AdminErrorState description={error} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-4 pb-24">
      <header className="admin-header">
        <div>
          <h1 className="flex items-center gap-2">
            Sell
            <AdminHint label="How does selling work?">
              Tap a product to add it to the sale. If it comes in several
              versions — different colours or sizes — you will be asked which
              one. Review the sale, take payment, done. Stock comes off this
              shop&rsquo;s shelf automatically.
            </AdminHint>
          </h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Ring up a walk-in customer. Only this shop&rsquo;s stock is shown.
          </p>
        </div>
      </header>

      {notice && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {notice}
        </p>
      )}

      <AdminFilterBar
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        queryLabel="Search this shop"
        placeholder="Search product or SKU…"
      >
        <AdminSelect
          aria-label="Filter by category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect
          aria-label="Filter by age range"
          value={ageRange}
          onChange={(event) => {
            setAgeRange(event.target.value);
            setPage(1);
          }}
        >
          {ageRanges.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </AdminSelect>
      </AdminFilterBar>

      {pageResult.rows.length === 0 ? (
        <AdminEmptyState
          title="Nothing matches"
          description="No product in this shop matches those filters. Clear them, or check the Stock tab for items that have sold out."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {pageResult.rows.map((group: CounterProductGroup) => {
            const only = soleSellableVariant(group);
            return (
              <CounterProductCard
                key={group.productId}
                group={group}
                inCart={quantityByProduct.get(group.productId) || 0}
                onChooseVersion={() => setPickerProductId(group.productId)}
                onAdd={() => only && addVariant(only.variantId as string)}
                onRemoveOne={() =>
                  setLines((current) =>
                    only?.variantId
                      ? setCartQuantity(
                          current,
                          only.variantId,
                          (quantityByVariant.get(only.variantId) || 0) - 1,
                        )
                      : current,
                  )
                }
              />
            );
          })}
        </div>
      )}

      {pageResult.totalPages > 1 && (
        <nav aria-label="Catalogue pages" className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage(pageResult.page - 1)}
            disabled={pageResult.page <= 1}
            className="admin-button admin-button-secondary disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <span className="text-sm font-semibold text-[var(--color-ink-soft)]">
            Page {pageResult.page} of {pageResult.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(pageResult.page + 1)}
            disabled={pageResult.page >= pageResult.totalPages}
            className="admin-button admin-button-secondary disabled:opacity-40"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </nav>
      )}

      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-2xl lg:left-[17.5rem]">
          <button
            type="button"
            onClick={() => {
              setSaleError("");
              setCartOpen(true);
            }}
            className="admin-button min-h-[3.25rem] w-full"
          >
            <ShoppingBag size={18} />
            Review sale · {totals.units} {totals.units === 1 ? "item" : "items"} ·{" "}
            {formatCedis(totals.total)}
          </button>
        </div>
      )}

      <CounterVariantPicker
        group={pickerGroup}
        quantityByVariant={quantityByVariant}
        onClose={() => setPickerProductId(null)}
        onAdd={addVariant}
        onRemoveOne={(variantId) =>
          setLines((current) =>
            setCartQuantity(current, variantId, (quantityByVariant.get(variantId) || 0) - 1),
          )
        }
      />

      <CounterCartPanel
        open={cartOpen}
        lines={lines}
        paymentMethod={paymentMethod}
        customerName={customerName}
        customerPhone={customerPhone}
        customerUserId={customerUserId}
        submitting={submitting}
        error={saleError}
        onClose={() => setCartOpen(false)}
        onSetQuantity={(variantId, quantity) =>
          setLines((current) => setCartQuantity(current, variantId, quantity))
        }
        onRemove={(variantId) => setLines((current) => removeCartLine(current, variantId))}
        onPaymentMethodChange={setPaymentMethod}
        onCustomerNameChange={setCustomerName}
        onCustomerPhoneChange={setCustomerPhone}
        onCustomerUserIdChange={(userId, displayName) => {
          setCustomerUserId(userId);
          if (displayName) setCustomerName(displayName);
        }}
        onComplete={() => void completeSale()}
      />

      <CounterReceiptPrintModal
        key={completedCashReceipt?.id || "counter-receipt"}
        open={Boolean(completedCashReceipt)}
        receipt={completedCashReceipt}
        onClose={() => setCompletedCashReceipt(null)}
      />
    </div>
  );
}

/**
 * `crypto.randomUUID` only exists in a secure context. A till reached over
 * plain HTTP on the shop LAN would otherwise throw during render and take the
 * whole Sell workspace down, so fall back to `getRandomValues` and finally to
 * a time-plus-random key. The key only needs to be unique per till, not
 * unguessable — the server derives the shop and cashier from the session.
 */
function newSaleKey() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return `sale-${webCrypto.randomUUID()}`;
  }
  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return `sale-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
