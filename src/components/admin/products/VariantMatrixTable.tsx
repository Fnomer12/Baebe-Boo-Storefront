"use client";

import { useEffect, useId, useRef } from "react";
import { ImageIcon, Undo2 } from "lucide-react";
import { optionKey, type ProductOption } from "@/domain/catalog/product-options";
import { AdminHint } from "@/components/admin/AdminHint";
import type { VariantDraft } from "./wizard-state";

type Shop = { id: string; name: string };

/**
 * Mobile-first: every cell is a labelled row of a card, and only at `sm` does
 * the thing become a table. Same trick, and the same reason, as
 * `.admin-datatable` in globals.css — rendering a card list alongside a table
 * would put two controls with the same accessible name on the page for every
 * cell, and "Price for Pink / 3M" has to mean exactly one input.
 */
const cellBase =
  "flex items-center justify-between gap-3 px-3 py-2 text-right before:flex-none before:text-[0.68rem] before:font-extrabold before:uppercase before:tracking-[0.09em] before:text-[var(--color-ink-soft)] before:content-[attr(data-label)] sm:table-cell sm:text-left sm:before:content-none";

function OptionChips({
  row,
  options,
}: {
  row: VariantDraft;
  options: readonly ProductOption[];
}) {
  const keys = options.length > 0 ? options.map((option) => optionKey(option.name)) : Object.keys(row.optionValues);
  const chips = keys
    .map((key, index) => ({ name: options[index]?.name ?? key, value: row.optionValues[key] }))
    .filter((chip) => Boolean(chip.value));

  if (chips.length === 0) {
    return <span className="text-sm font-semibold">Only version</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.name}
          title={`${chip.name}: ${chip.value}`}
          className="inline-flex items-center rounded-full bg-[var(--color-brand-tint)] px-2.5 py-1 text-xs font-semibold"
        >
          {chip.value}
        </span>
      ))}
    </span>
  );
}

export default function VariantMatrixTable({
  rows,
  options,
  shops,
  selected,
  defaultKey,
  showComparePrices,
  productImageUrl,
  skuErrors,
  priceErrorKeys,
  onToggleSelect,
  onToggleAll,
  onChangeRow,
  onDefaultChange,
  onShowComparePricesChange,
}: {
  rows: readonly VariantDraft[];
  options: readonly ProductOption[];
  shops: readonly Shop[];
  selected: ReadonlySet<string>;
  defaultKey: string;
  showComparePrices: boolean;
  /** Falls in behind any version with no photo of its own. */
  productImageUrl: string;
  /** Keyed by row key. Set from a 409, which names the code but not the row. */
  skuErrors: Record<string, string>;
  priceErrorKeys: ReadonlySet<string>;
  onToggleSelect: (key: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onChangeRow: (key: string, patch: Partial<VariantDraft>) => void;
  onDefaultChange: (key: string) => void;
  onShowComparePricesChange: (show: boolean) => void;
}) {
  const defaultGroup = useId();
  const compareToggleId = useId();
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const liveRows = rows.filter((row) => !row.removed);
  const tickedCount = liveRows.filter((row) => selected.has(row.key)).length;
  const allSelected = liveRows.length > 0 && tickedCount === liveRows.length;

  // `indeterminate` has no HTML attribute, so it can only be set on the node.
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = tickedCount > 0 && !allSelected;
  }, [allSelected, tickedCount]);

  const singleShop = shops.length === 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={compareToggleId} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            id={compareToggleId}
            type="checkbox"
            checked={showComparePrices}
            onChange={(event) => onShowComparePricesChange(event.target.checked)}
            className="h-5 w-5 accent-[var(--color-brand)]"
          />
          Show sale prices
        </label>
        <AdminHint label="What are sale prices?">
          Adds a &ldquo;was&rdquo; price column. Fill it in and the shop shows the old price crossed
          out next to the new one. Leave the column hidden if nothing is on offer.
        </AdminHint>
      </div>

      {/* The grid scrolls inside itself so the Save button in the footer stays
          on screen with a hundred rows behind it. */}
      <div className="max-h-[45dvh] overflow-auto overscroll-contain rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="block w-full border-collapse text-left sm:table">
          <caption className="sr-only">Every version of this product, with its code, price and stock</caption>
          <thead className="hidden sm:table-header-group">
            <tr className="sticky top-0 z-10 bg-[var(--color-cream)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-soft)] shadow-[inset_0_-1px_0_var(--color-line)]">
              <th scope="col" className="px-3 py-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Select every version"
                  checked={allSelected}
                  onChange={(event) => onToggleAll(event.target.checked)}
                  className="h-5 w-5 accent-[var(--color-brand)]"
                />
              </th>
              <th scope="col" className="px-3 py-3">Version</th>
              <th scope="col" className="px-3 py-3">SKU</th>
              <th scope="col" className="px-3 py-3">Price</th>
              {showComparePrices && <th scope="col" className="px-3 py-3">Was</th>}
              <th scope="col" className="px-3 py-3">Photo</th>
              {shops.map((shop) => (
                <th key={shop.id} scope="col" className="px-3 py-3">
                  {singleShop ? "Stock" : shop.name}
                </th>
              ))}
              <th scope="col" className="px-3 py-3">On</th>
              <th scope="col" className="px-3 py-3">Default</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {rows.map((row) => (
              <tr
                key={row.key}
                data-removed={row.removed ? "true" : undefined}
                className={`block border-b border-[var(--color-line)] py-2 last:border-b-0 sm:table-row ${
                  row.removed ? "opacity-45" : ""
                }`}
              >
                <td data-label="Select" className={`${cellBase} sm:w-12`}>
                  {row.removed ? (
                    <button
                      type="button"
                      onClick={() => onChangeRow(row.key, { removed: false })}
                      className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--color-brand-deep)]"
                    >
                      <Undo2 size={15} /> Undo
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.title}`}
                      checked={selected.has(row.key)}
                      onChange={(event) => onToggleSelect(row.key, event.target.checked)}
                      className="h-5 w-5 accent-[var(--color-brand)]"
                    />
                  )}
                </td>

                <td data-label="Version" className={`${cellBase} sm:min-w-[9rem]`}>
                  <OptionChips row={row} options={options} />
                </td>

                <td data-label="SKU" className={cellBase}>
                  <span className="w-full">
                    <input
                      value={row.sku}
                      aria-label={`Code for ${row.title}`}
                      aria-invalid={skuErrors[row.key] ? true : undefined}
                      disabled={row.removed}
                      onChange={(event) => onChangeRow(row.key, { sku: event.target.value })}
                      className={`admin-input min-h-11 !px-3 text-sm sm:w-40 ${
                        skuErrors[row.key] ? "!border-red-500 bg-red-50" : ""
                      }`}
                    />
                    {skuErrors[row.key] && (
                      <span role="alert" className="mt-1 block text-left text-xs font-medium text-red-700">
                        {skuErrors[row.key]}
                      </span>
                    )}
                  </span>
                </td>

                <td data-label="Price" className={cellBase}>
                  <span className="relative block w-full sm:w-32">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-ink-soft)]"
                    >
                      GH₵
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.price}
                      aria-label={`Price for ${row.title}`}
                      aria-invalid={priceErrorKeys.has(row.key) ? true : undefined}
                      disabled={row.removed}
                      onChange={(event) => onChangeRow(row.key, { price: event.target.value })}
                      className={`admin-input min-h-11 !pl-12 !pr-2 text-sm ${
                        priceErrorKeys.has(row.key) ? "!border-red-500 bg-red-50" : ""
                      }`}
                    />
                  </span>
                </td>

                {showComparePrices && (
                  <td data-label="Was" className={cellBase}>
                    <span className="relative block w-full sm:w-32">
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--color-ink-soft)]"
                      >
                        GH₵
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={row.compareAtPrice}
                        aria-label={`Was-price for ${row.title}`}
                        disabled={row.removed}
                        onChange={(event) =>
                          onChangeRow(row.key, { compareAtPrice: event.target.value })
                        }
                        className="admin-input min-h-11 !pl-12 !pr-2 text-sm"
                      />
                    </span>
                  </td>
                )}

                <td data-label="Photo" className={cellBase}>
                  <VariantThumb row={row} productImageUrl={productImageUrl} />
                </td>

                {shops.map((shop) => (
                  <td key={shop.id} data-label={singleShop ? "Stock" : shop.name} className={cellBase}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.stock[shop.id] ?? ""}
                      aria-label={`Stock for ${row.title} at ${shop.name}`}
                      disabled={row.removed}
                      onChange={(event) =>
                        onChangeRow(row.key, { stock: { ...row.stock, [shop.id]: event.target.value } })
                      }
                      className="admin-input min-h-11 !px-3 text-sm sm:w-24"
                    />
                  </td>
                ))}

                <td data-label="On" className={cellBase}>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${row.title} is on sale`}
                    checked={row.isActive}
                    disabled={row.removed}
                    onChange={(event) => onChangeRow(row.key, { isActive: event.target.checked })}
                    className="h-6 w-6 accent-[var(--color-brand)]"
                  />
                </td>

                <td data-label="Default" className={cellBase}>
                  <input
                    type="radio"
                    name={defaultGroup}
                    aria-label={`Show ${row.title} first`}
                    checked={defaultKey === row.key}
                    disabled={row.removed || !row.isActive}
                    onChange={() => onDefaultChange(row.key)}
                    className="h-6 w-6 accent-[var(--color-brand)]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 40px of "which one is this".
 *
 * A version with no photo of its own is not missing a photo — it shows the
 * product's. Saying so out loud stops sellers uploading the same picture
 * twelve times to make the empty squares go away.
 */
function VariantThumb({ row, productImageUrl }: { row: VariantDraft; productImageUrl: string }) {
  const source = row.imageUrl || productImageUrl;
  return (
    <span className="flex items-center gap-1.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--color-cream)]">
        {source ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source}
            alt=""
            className={`h-full w-full object-cover ${row.imageUrl ? "" : "opacity-55"}`}
          />
        ) : (
          <ImageIcon size={15} aria-hidden="true" style={{ color: "var(--color-ink-soft)" }} />
        )}
      </span>
      {!row.imageUrl && (
        <AdminHint label={`Photo for ${row.title}`}>
          This version has no photo of its own, so shoppers see the main product photo. That is
          usually right — add one only when this version looks different.
        </AdminHint>
      )}
    </span>
  );
}
