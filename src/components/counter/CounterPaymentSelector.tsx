"use client";

import { Banknote, CreditCard, Smartphone } from "lucide-react";
import type { CounterPaymentMethod } from "@/domain/counter/catalog";

const OPTIONS: readonly {
  method: CounterPaymentMethod;
  label: string;
  icon: typeof Banknote;
}[] = [
  { method: "cash", label: "Cash", icon: Banknote },
  { method: "visa", label: "Card", icon: CreditCard },
  { method: "momo", label: "Mobile money", icon: Smartphone },
] as const;

/**
 * Payment method picker sized for a thumb at a till.
 *
 * A native radio group rather than buttons, so a cashier on a keyboard-driven
 * terminal can move between options with the arrow keys.
 */
export default function CounterPaymentSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: CounterPaymentMethod;
  onChange: (method: CounterPaymentMethod) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ method, label, icon: Icon }) => {
        const selected = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(method)}
            className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-xs font-bold transition disabled:opacity-50 ${
              selected
                ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white"
                : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:bg-[var(--color-brand-tint)]"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
