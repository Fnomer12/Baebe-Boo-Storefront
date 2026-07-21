"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ReviewablePurchase = {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
};

export default function VerifiedReviewForm({ purchases }: { purchases: ReviewablePurchase[] }) {
  const router = useRouter();
  const [purchaseIndex, setPurchaseIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const purchase = purchases[purchaseIndex];
    if (!purchase) return;
    const form = new FormData(formElement);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: purchase.orderId,
          productId: purchase.productId,
          rating: Number(form.get("rating")),
          title: form.get("title"),
          body: form.get("body"),
        }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(result?.message || "We could not submit this review.");
        return;
      }
      formElement.reset();
      setMessage("Thank you. Your verified-purchase review is awaiting moderation.");
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!purchases.length) return <p className="mt-8 rounded-3xl bg-[#f8f5f0] p-6 text-sm text-black/55">Products from delivered, paid orders will become available to review here.</p>;
  const inputClass = "mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500";

  return (
    <form onSubmit={submit} className="mt-9 rounded-3xl border border-black/10 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Write a verified review</h2>
      <p className="mt-2 text-sm leading-6 text-black/50">Reviews are linked to delivered purchases and checked before publication.</p>
      <label className="mt-5 block text-xs font-semibold">Product
        <select className={inputClass} value={purchaseIndex} onChange={(event) => setPurchaseIndex(Number(event.target.value))}>
          {purchases.map((purchase, index) => <option key={`${purchase.orderId}:${purchase.productId}`} value={index}>{purchase.productName} · {purchase.orderNumber}</option>)}
        </select>
      </label>
      <label className="mt-4 block text-xs font-semibold">Rating
        <select className={inputClass} name="rating" defaultValue="5">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}</select>
      </label>
      <label className="mt-4 block text-xs font-semibold">Title<input className={inputClass} name="title" maxLength={120} /></label>
      <label className="mt-4 block text-xs font-semibold">Review<textarea className={inputClass} name="body" required minLength={20} maxLength={2000} rows={5} /></label>
      <button disabled={pending} className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Submitting…" : "Submit review"}</button>
      <p aria-live="polite" className="mt-4 min-h-5 text-sm text-black/60">{message}</p>
    </form>
  );
}
