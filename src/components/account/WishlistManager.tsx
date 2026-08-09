"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Loader2, Trash2 } from "lucide-react";

export type WishlistItem = {
  wishlistId: string;
  productId: string;
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

export default function WishlistManager() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/account/wishlist/details");
        const result = (await response.json().catch(() => ({ items: [] }))) as { items?: WishlistItem[] };
        if (!cancelled) {
          setItems(Array.isArray(result.items) ? result.items : []);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("We could not load your wishlist.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function removeItem(productId: string) {
    setRemovingId(productId);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/account/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, active: false }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(result?.message || "We could not remove this item.");
        return;
      }
      setItems((current) => current.filter((item) => item.productId !== productId));
      setMessage("Item removed from your wishlist.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-9 flex items-center justify-center rounded-3xl bg-[var(--color-cream)] p-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-brand-deep)]" />
      </div>
    );
  }

  if (error && !items.length) {
    return (
      <div className="mt-9 rounded-3xl bg-red-50 p-6 text-sm text-red-800">
        <p>{error}</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mt-9 rounded-3xl border border-dashed border-black/15 bg-[var(--color-cream)] p-8 text-center">
        <Heart size={32} className="mx-auto text-black/25" />
        <p className="mt-4 font-semibold">Your wishlist is empty.</p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/50">
          Tap the heart on products you love and they will be waiting here.
        </p>
        <Link href="/store" className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-9">
      {error ? <p className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="mb-4 rounded-2xl bg-green-50 p-4 text-sm text-green-800">{message}</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.productId} className="flex gap-4 rounded-3xl bg-[var(--color-cream)] p-4">
            <div className="shrink-0">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  width={80}
                  height={80}
                  unoptimized
                  className="size-20 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-2xl bg-white">
                  <Heart size={24} className="text-black/25" />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <p className="truncate font-semibold">{item.name}</p>
                <p className="mt-1 text-sm font-medium text-black/60">GH₵{Number(item.price).toFixed(2)}</p>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Link
                  href={`/products/${item.productId}`}
                  className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white"
                >
                  View product
                </Link>
                <button
                  type="button"
                  onClick={() => removeItem(item.productId)}
                  disabled={removingId === item.productId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                >
                  {removingId === item.productId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
