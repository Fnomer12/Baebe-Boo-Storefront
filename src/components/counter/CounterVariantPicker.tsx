"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Minus, Plus, X } from "lucide-react";
import type { CounterProductGroup } from "@/domain/counter/grouping";
import { variantLabel } from "@/domain/counter/grouping";
import { availableStock } from "@/domain/counter/stock";
import { formatCedis } from "@/domain/counter/money";

/**
 * Pick which version of a product to ring up.
 *
 * Deliberately NOT `AdminModal`: this is a till, often a tablet held in one
 * hand, so it is a bottom sheet with rows a thumb can hit rather than a
 * centred dialog with a 44px close button in the far corner. Each row is a
 * full-width target with its own +/− so a cashier can add two 3M and one 6M
 * without closing and reopening.
 */
export default function CounterVariantPicker({
  group,
  quantityByVariant,
  onClose,
  onAdd,
  onRemoveOne,
}: {
  group: CounterProductGroup | null;
  quantityByVariant: Map<string, number>;
  onClose: () => void;
  onAdd: (variantId: string) => void;
  onRemoveOne: (variantId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!group) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [group, onClose]);

  if (!group) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-[var(--color-ink)]/30 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a version of ${group.name}`}
        tabIndex={-1}
        className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] p-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[var(--color-cream)]">
            {group.imageUrl && (
              <Image src={group.imageUrl} alt="" fill sizes="56px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug">{group.name}</h2>
            <p className="text-xs text-[var(--color-ink-soft)]">
              {group.variants.length} versions · {group.available} in stock
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)]"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-[var(--color-line)] overflow-y-auto overscroll-contain">
          {group.variants.map((variant) => {
            const available = availableStock(variant);
            const inCart = variant.variantId
              ? quantityByVariant.get(variant.variantId) || 0
              : 0;
            const sellable = Boolean(variant.variantId) && available > 0;
            const label = variantLabel(variant);

            return (
              <li key={variant.variantId || variant.sku} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {variant.sku} ·{" "}
                    {available > 0 ? `${available} left` : "Out of stock"}
                  </p>
                  <p className="mt-0.5 text-sm font-bold">{formatCedis(variant.price)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => variant.variantId && onRemoveOne(variant.variantId)}
                    disabled={inCart === 0}
                    aria-label={`Remove one ${group.name} ${label}`}
                    className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40"
                  >
                    <Minus size={18} />
                  </button>
                  <span
                    aria-live="polite"
                    className="min-w-[2rem] text-center text-base font-bold"
                  >
                    {inCart}
                  </span>
                  <button
                    type="button"
                    onClick={() => variant.variantId && onAdd(variant.variantId)}
                    disabled={!sellable || inCart >= available}
                    aria-label={`Add one ${group.name} ${label}`}
                    className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-ink)] text-white disabled:opacity-40"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[var(--color-line)] p-4">
          <button type="button" onClick={onClose} className="admin-button min-h-[3rem] w-full justify-center">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
