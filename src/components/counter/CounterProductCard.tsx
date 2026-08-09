"use client";

import Image from "next/image";
import { Minus, Plus, Layers } from "lucide-react";
import type { CounterProductGroup } from "@/domain/counter/grouping";
import { needsVariantPicker, soleSellableVariant } from "@/domain/counter/grouping";
import { stockStatus } from "@/domain/counter/stock";
import { formatCedisRange } from "@/domain/counter/money";

const STATUS_CLASS: Record<string, string> = {
  out: "bg-red-100 text-red-800",
  low: "bg-amber-100 text-amber-900",
  healthy: "bg-emerald-100 text-emerald-800",
};

/**
 * One product on the sell grid.
 *
 * A product with a single version keeps the one-tap +/− it always had. A
 * product with several opens a picker instead, because the cashier has to
 * choose a size either way and choosing from a labelled list beats guessing
 * between four cards that differ only in the last two characters of a SKU.
 */
export default function CounterProductCard({
  group,
  inCart,
  onAdd,
  onRemoveOne,
  onChooseVersion,
}: {
  group: CounterProductGroup;
  /** Units of this product across every version currently in the cart. */
  inCart: number;
  onAdd: () => void;
  onRemoveOne: () => void;
  onChooseVersion: () => void;
}) {
  const status = stockStatus(group.available);
  const hasVersions = needsVariantPicker(group);
  const single = soleSellableVariant(group);
  // A legacy row carries no variant id and complete_counter_sale sells by
  // variant, so it is displayable but not sellable.
  const unsellableLegacy = !hasVersions && !single && group.variants[0]?.variantId === null;

  return (
    <article className="admin-card flex flex-col overflow-hidden">
      <div className="relative aspect-square w-full bg-[var(--color-cream)]">
        {group.imageUrl ? (
          <Image
            src={group.imageUrl}
            alt={group.name}
            fill
            sizes="(min-width: 1024px) 20vw, 45vw"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs font-bold text-[var(--color-ink-soft)]">
            No image
          </div>
        )}
        <span className={`admin-badge absolute left-2 top-2 ${STATUS_CLASS[status]}`}>
          {group.available > 0 ? `${group.available} left` : "Out of stock"}
        </span>
        {hasVersions && (
          <span className="admin-badge absolute right-2 top-2 bg-[var(--color-ink)] text-white">
            <Layers size={12} aria-hidden="true" />
            {group.variants.length}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug">{group.name}</h3>
        <p className="text-xs text-[var(--color-ink-soft)]">
          {hasVersions
            ? `${group.variants.length} versions`
            : group.variants[0]?.sku || group.sku}
        </p>
        <p className="mt-auto pt-2 text-base font-bold">
          {formatCedisRange(group.priceFrom, group.priceTo)}
        </p>

        {unsellableLegacy ? (
          <p className="mt-2 rounded-xl bg-[var(--color-cream)] px-3 py-2 text-[0.7rem] font-semibold leading-snug text-[var(--color-ink-soft)]">
            This product has no sellable option in the catalogue yet, so it
            cannot be rung up here.
          </p>
        ) : hasVersions ? (
          <button
            type="button"
            onClick={onChooseVersion}
            disabled={group.available <= 0}
            className="admin-button mt-2 min-h-[2.75rem] w-full justify-center disabled:opacity-40"
          >
            {inCart > 0 ? `Choose version · ${inCart} in sale` : "Choose version"}
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRemoveOne}
              disabled={inCart === 0}
              aria-label={`Remove one ${group.name}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40"
            >
              <Minus size={16} />
            </button>
            <span
              aria-live="polite"
              className="min-w-[2.5rem] flex-1 text-center text-sm font-bold"
            >
              {inCart}
            </span>
            <button
              type="button"
              onClick={onAdd}
              disabled={!single || inCart >= group.available}
              aria-label={`Add one ${group.name}`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-ink)] text-white disabled:opacity-40"
            >
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
