"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminWorkspacePrimitives";
import { formatCedis } from "@/domain/money";

type LabelVariant = {
  id: string;
  sku: string;
  title: string;
  price: number;
};

type LabelProduct = {
  id: string;
  name: string;
  variants: LabelVariant[];
};

type Selection = Record<string, { checked: boolean; copies: number }>;

function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Pick versions, set copies, download a 50×30mm label PDF for the XP-365B.
 *
 * Works off the same product list the workspace already loads — no new data
 * fetching beyond the first page pull. Anything not ticked simply is not
 * printed, and copies cap at 50 per version so a stray keystroke cannot queue
 * thousands of stickers.
 */
export default function LabelPrintModal({ onClose }: { onClose: () => void }) {
  const [products, setProducts] = useState<LabelProduct[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>({});
  const [busy, setBusy] = useState<"labels" | "calibration" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/products?pageSize=200", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          products?: Array<{
            id?: unknown;
            name?: unknown;
            variants?: Array<{ id?: unknown; sku?: unknown; title?: unknown; price?: unknown }>;
          }>;
        };
        if (!response.ok) throw new Error("unavailable");
        if (cancelled) return;
        setProducts(
          (payload.products || [])
            .map((row) => ({
              id: String(row.id ?? ""),
              name: String(row.name ?? "Product"),
              variants: (row.variants || []).map((variant) => ({
                id: String(variant.id ?? ""),
                sku: String(variant.sku ?? ""),
                title: String(variant.title ?? "Default"),
                price: Number(variant.price ?? 0),
              })).filter((variant) => variant.id && variant.sku),
            }))
            .filter((row) => row.id && row.variants.length > 0),
        );
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(body: unknown, filename: string, kind: "labels" | "calibration") {
    setBusy(kind);
    setError("");
    try {
      const response = await fetch("/api/admin/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(failure?.message || "Labels could not be generated.");
      }
      downloadPdf(await response.blob(), filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Labels could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  const visible = (products || []).filter(
    (product) =>
      product.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      product.variants.some((variant) => variant.sku.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const stickerCount = Object.values(selection).reduce(
    (sum, entry) => sum + (entry.checked ? Math.max(1, entry.copies) : 0),
    0,
  );

  function toggleVariant(id: string) {
    setSelection((current) => {
      const entry = current[id] || { checked: false, copies: 1 };
      return { ...current, [id]: { ...entry, checked: !entry.checked } };
    });
  }

  function setCopies(id: string, copies: number) {
    const safe = Number.isFinite(copies) ? Math.min(50, Math.max(1, Math.floor(copies))) : 1;
    setSelection((current) => ({ ...current, [id]: { checked: true, copies: safe } }));
  }

  async function downloadLabels() {
    const items: Array<{ productId: string; variantId: string; copies: number }> = [];
    for (const product of products || []) {
      for (const variant of product.variants) {
        const entry = selection[variant.id];
        if (entry?.checked) {
          items.push({ productId: product.id, variantId: variant.id, copies: entry.copies });
        }
      }
    }
    if (items.length === 0) {
      setError("Tick at least one version first.");
      return;
    }
    await post({ items }, "baebe-boo-labels.pdf", "labels");
  }

  return (
    <AdminModal open onClose={onClose} title="Print shelf labels" subtitle="50 × 30 mm · XP-365B">
      <div className="space-y-4">
        <p className="text-xs leading-5 text-[var(--color-ink-soft)]">
          Tick the versions to sticker and set copies. Each sticker carries the price, a QR to
          the product page, and the SKU. Print at <strong>actual size</strong> — never
          “fit to page” — or the stickers come out the wrong size.
        </p>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-900">
            {error}
          </p>
        )}

        {unavailable ? (
          <p className="text-xs text-[var(--color-ink-soft)]">
            The product list could not be loaded. Reload the page and try again.
          </p>
        ) : products === null ? (
          <p className="text-xs text-[var(--color-ink-soft)]">Loading products…</p>
        ) : (
          <>
            <input
              type="search"
              className="admin-input"
              placeholder="Search products or SKUs…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search products or SKUs"
            />
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {visible.map((product) => (
                <fieldset key={product.id} className="rounded-2xl border border-[var(--color-line)] p-3">
                  <legend className="px-1 text-sm font-semibold">{product.name}</legend>
                  {product.variants.map((variant) => {
                    const entry = selection[variant.id] || { checked: false, copies: 1 };
                    return (
                      <div key={variant.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          id={`label-${variant.id}`}
                          className="h-5 w-5 shrink-0 accent-[var(--color-brand-deep)]"
                          checked={entry.checked}
                          onChange={() => toggleVariant(variant.id)}
                        />
                        <label htmlFor={`label-${variant.id}`} className="min-w-0 flex-1 truncate">
                          {variant.title}
                          <span className="ml-2 font-mono text-xs text-[var(--color-ink-soft)]">{variant.sku}</span>
                          <span className="ml-2 text-xs font-semibold">{formatCedis(variant.price)}</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          aria-label={`Copies of ${variant.sku}`}
                          className="admin-input w-16 shrink-0 px-2 py-1.5 text-center"
                          value={entry.copies}
                          onChange={(event) => setCopies(variant.id, Number(event.target.value))}
                        />
                      </div>
                    );
                  })}
                </fieldset>
              ))}
              {visible.length === 0 && (
                <p className="text-xs text-[var(--color-ink-soft)]">No products match that search.</p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void downloadLabels()}
            disabled={busy !== null || stickerCount === 0}
            className="admin-button h-12 flex-1 disabled:opacity-50"
          >
            <Printer size={18} /> {busy === "labels" ? "Preparing…" : `Download ${stickerCount} sticker${stickerCount === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={() => void post({ calibration: true }, "baebe-boo-label-calibration.pdf", "calibration")}
            disabled={busy !== null}
            className="admin-button admin-button-secondary h-12 flex-1 disabled:opacity-50"
          >
            Print test page first
          </button>
        </div>
        <p className="text-xs leading-5 text-[var(--color-ink-soft)]">
          Always print the test page first: measure its border against a ruler (exactly 50 ×
          30 mm) and scan both codes with a phone. If either fails, fix the printer settings
          before the batch — not after.
        </p>
      </div>
    </AdminModal>
  );
}
