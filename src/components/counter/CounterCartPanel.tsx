"use client";

import Image from "next/image";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import type { CounterCartLine, CounterPaymentMethod } from "@/domain/counter/catalog";
import { cartTotals } from "@/domain/counter/cart";
import { formatCedis } from "@/domain/counter/money";
import CounterPaymentSelector from "./CounterPaymentSelector";
import { AdminHint } from "@/components/admin/AdminHint";

/**
 * The cart is its own component rather than an `AdminModal`: that modal is
 * `max-w-md` and single-column, while a till needs a two-column layout from
 * tablet width up and a pinned total/complete footer the cashier never has
 * to scroll for.
 */
export default function CounterCartPanel({
  open,
  lines,
  paymentMethod,
  customerName,
  customerPhone,
  submitting,
  error,
  onClose,
  onSetQuantity,
  onRemove,
  onPaymentMethodChange,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onComplete,
}: {
  open: boolean;
  lines: readonly CounterCartLine[];
  paymentMethod: CounterPaymentMethod;
  customerName: string;
  customerPhone: string;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSetQuantity: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
  onPaymentMethodChange: (method: CounterPaymentMethod) => void;
  onCustomerNameChange: (value: string) => void;
  onCustomerPhoneChange: (value: string) => void;
  onComplete: () => void;
}) {
  if (!open) return null;
  const totals = cartTotals(lines);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Current sale"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the current sale"
        className="absolute inset-0 bg-[var(--color-ink)]/25 backdrop-blur-sm"
      />

      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl sm:max-h-[88dvh] sm:max-w-4xl sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-brand-deep)]">
              Current sale
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {totals.units} {totals.units === 1 ? "item" : "items"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the current sale"
            className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:flex-row md:overflow-hidden">
          <ul className="flex-1 divide-y divide-[var(--color-line)] px-5 md:min-h-0 md:overflow-y-auto">
            {lines.length === 0 && (
              <li className="py-14 text-center">
                <ShoppingBag
                  size={28}
                  className="mx-auto text-[var(--color-ink-soft)]"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                  Nothing in this sale yet.
                </p>
              </li>
            )}

            {lines.map((line) => (
              <li key={line.variantId} className="flex items-center gap-3 py-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--color-cream)]">
                  {line.imageUrl && (
                    <Image
                      src={line.imageUrl}
                      alt={line.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{line.name}</p>
                  {line.variantTitle && (
                    // Two lines of the same product name with no version is
                    // how a cashier hands over the wrong size.
                    <p className="text-xs font-semibold text-[var(--color-brand-deep)]">
                      {line.variantTitle}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-ink-soft)]">{line.sku}</p>
                  <p className="mt-1 text-sm font-semibold">{formatCedis(line.price)}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSetQuantity(line.variantId, line.quantity - 1)}
                    aria-label={`Reduce ${line.name}`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--color-line)]"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="min-w-[2rem] text-center text-sm font-bold">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSetQuantity(line.variantId, line.quantity + 1)}
                    disabled={line.quantity >= line.available}
                    aria-label={`Increase ${line.name}`}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--color-line)] disabled:opacity-40"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(line.variantId)}
                    aria-label={`Remove ${line.name}`}
                    className="grid h-10 w-10 place-items-center rounded-xl text-red-700 hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <aside className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-cream)] p-5 md:w-80 md:border-l md:border-t-0 md:overflow-y-auto">
            <span className="admin-label flex items-center gap-1.5">
              <label htmlFor="counter-customer-name">Customer name</label>
              <AdminHint label="What is Customer name?">
                Optional. Only worth filling in if the customer wants a receipt
                in their name or may come back to exchange something.
              </AdminHint>
            </span>
            <input
              id="counter-customer-name"
              className="admin-input"
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="Walk-in Customer"
              autoComplete="off"
            />

            <span className="admin-label mt-4 flex items-center gap-1.5">
              <label htmlFor="counter-customer-phone">Phone (optional)</label>
              <AdminHint label="What is Phone?">
                Lets you find this sale again later if they come back without a
                receipt. Leave it blank if they would rather not say.
              </AdminHint>
            </span>
            <input
              id="counter-customer-phone"
              className="admin-input"
              value={customerPhone}
              onChange={(event) => onCustomerPhoneChange(event.target.value)}
              inputMode="tel"
              autoComplete="off"
            />

            <p className="admin-label mt-4">Payment</p>
            <CounterPaymentSelector
              value={paymentMethod}
              onChange={onPaymentMethodChange}
              disabled={submitting}
            />
          </aside>
        </div>

        {/* Pinned footer: the total and the complete action must never scroll
            out of reach — the cashier should not hunt for them mid-queue. */}
        <footer className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-cream)] px-5 py-4">
          <dl className="flex items-baseline justify-between">
            <dt className="text-sm font-bold uppercase tracking-widest text-[var(--color-ink-soft)]">
              Total
            </dt>
            <dd className="text-2xl font-bold">{formatCedis(totals.total)}</dd>
          </dl>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onComplete}
            disabled={submitting || lines.length === 0}
            className="admin-button mt-3 w-full min-h-[3.25rem] disabled:opacity-50"
          >
            {submitting ? "Completing…" : `Complete sale · ${formatCedis(totals.total)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
