"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ReturnEligibleOrder = {
  id: string;
  orderNumber: string;
  items: Array<{ id: string; productName: string; quantity: number }>;
};

export default function ReturnRequestForm({ orders }: { orders: ReturnEligibleOrder[] }) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(orders[0]?.id || "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const order = useMemo(() => orders.find((candidate) => candidate.id === orderId), [orderId, orders]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: form.get("reason"), notes: form.get("notes"), items }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(result?.message || "We could not submit this return request.");
        return;
      }
      setQuantities({});
      formElement.reset();
      setMessage("Return request received. Our team will review it before any item is sent back.");
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!orders.length) return <p className="mt-8 rounded-3xl bg-[var(--color-cream)] p-6 text-sm text-black/55">Delivered, paid orders that are eligible for a return will appear here.</p>;

  const inputClass = "mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-brand)]";
  return (
    <form onSubmit={submit} className="mt-9 rounded-3xl border border-black/10 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Request a return</h2>
      <p className="mt-2 text-sm leading-6 text-black/50">Choose only items you intend to return. Submission does not guarantee approval.</p>
      <label className="mt-5 block text-xs font-semibold">Order
        <select className={inputClass} value={orderId} onChange={(event) => { setOrderId(event.target.value); setQuantities({}); }}>
          {orders.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.orderNumber}</option>)}
        </select>
      </label>
      <fieldset className="mt-5 space-y-3"><legend className="text-xs font-semibold">Items and quantities</legend>
        {order?.items.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--color-cream)] p-4 text-sm">
            <span>{item.productName} <span className="text-black/40">(bought {item.quantity})</span></span>
            <input aria-label={`Return quantity for ${item.productName}`} type="number" min={0} max={item.quantity} value={quantities[item.id] || 0} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: Number(event.target.value) }))} className="w-20 rounded-xl border border-black/10 px-3 py-2" />
          </label>
        ))}
      </fieldset>
      <label className="mt-5 block text-xs font-semibold">Reason<textarea className={inputClass} name="reason" required minLength={10} maxLength={300} rows={3} /></label>
      <label className="mt-4 block text-xs font-semibold">Additional notes<textarea className={inputClass} name="notes" maxLength={1500} rows={4} /></label>
      <button disabled={pending} className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Submitting…" : "Submit request"}</button>
      <p aria-live="polite" className="mt-4 min-h-5 text-sm text-black/60">{message}</p>
    </form>
  );
}
