"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Calendar, Gift, Loader2, Trash2 } from "lucide-react";

export type RegistryItem = {
  product_id: string;
  requested_quantity: number;
  purchased_quantity: number;
  priority: string;
  products: { name: string; image_url: string | null; price: number } | null;
};

export type Registry = {
  id: string;
  title: string;
  event_date: string | null;
  status: string;
  public_token: string;
  created_at: string;
  gift_registry_items: RegistryItem[] | null;
};

export default function GiftRegistryManager() {
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const loadRegistries = useCallback(async () => {
    try {
      const response = await fetch("/api/account/registries");
      const result = (await response.json().catch(() => ({ registries: [] }))) as {
        registries?: Registry[];
      };
      setRegistries(Array.isArray(result.registries) ? result.registries : []);
      setLoading(false);
    } catch {
      setError("We could not load your gift registries.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegistries();
  }, [loadRegistries]);

  async function createRegistry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/account/registries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          eventDate: form.get("eventDate") || undefined,
          status: "active",
        }),
      });
      const result = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!response.ok) {
        setError(result?.message || "We could not create this registry.");
        return;
      }
      event.currentTarget.reset();
      setMessage("Registry created.");
      // The list is client-fetched state; router.refresh() only re-renders
      // server components and left the new registry invisible until reload.
      await loadRegistries();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function deleteRegistry(id: string) {
    if (!window.confirm("Delete this gift registry?")) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/account/registries/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(result?.message || "We could not delete this registry.");
        return;
      }
      setRegistries((current) => current.filter((registry) => registry.id !== id));
      setMessage("Registry deleted.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
  }

  async function removeItem(registryId: string, productId: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/account/registry-items/${registryId}/${productId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(result?.message || "We could not remove this item.");
        return;
      }
      setRegistries((current) =>
        current.map((registry) =>
          registry.id === registryId
            ? {
                ...registry,
                gift_registry_items:
                  registry.gift_registry_items?.filter((item) => item.product_id !== productId) ?? [],
              }
            : registry,
        ),
      );
      setMessage("Item removed from registry.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
  }

  const inputClass = "mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-brand)]";

  if (loading) {
    return (
      <div className="mt-9 flex items-center justify-center rounded-3xl bg-[var(--color-cream)] p-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-brand-deep)]" />
      </div>
    );
  }

  return (
    <div className="mt-9 space-y-8">
      {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">{message}</p> : null}

      <form onSubmit={createRegistry} className="rounded-3xl border border-black/10 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Create a registry</h2>
        <p className="mt-2 text-sm leading-6 text-black/50">Plan a baby shower, birthday or thoughtful gift list.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Title
            <input className={inputClass} name="title" required minLength={1} maxLength={160} placeholder="Baby shower" />
          </label>
          <label className="text-xs font-semibold">
            Event date
            <input className={inputClass} name="eventDate" type="date" />
          </label>
        </div>
        <button
          disabled={pending}
          className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create registry"}
        </button>
      </form>

      <div className="space-y-4">
        {registries.length ? (
          registries.map((registry) => (
            <article key={registry.id} className="rounded-3xl bg-[var(--color-cream)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Gift size={20} className="text-[var(--color-brand-deep)]" />
                    <h3 className="text-lg font-semibold">{registry.title}</h3>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-black/55">
                    {registry.event_date ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={14} />
                        {new Date(registry.event_date).toLocaleDateString("en-GH", { dateStyle: "long" })}
                      </span>
                    ) : null}
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize">
                      {registry.status}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteRegistry(registry.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-red-700"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>

              {registry.gift_registry_items && registry.gift_registry_items.length > 0 ? (
                <ul className="mt-5 space-y-3 border-t border-black/10 pt-5">
                  {registry.gift_registry_items.map((item) => (
                    <li key={item.product_id} className="flex items-center justify-between gap-4 rounded-2xl bg-white p-3">
                      <div className="flex items-center gap-3">
                        {item.products?.image_url ? (
                          <Image
                            src={item.products.image_url}
                            alt={item.products.name}
                            width={48}
                            height={48}
                            unoptimized
                            className="size-12 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-cream)]">
                            <Gift size={18} className="text-black/25" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold">{item.products?.name ?? "Product"}</p>
                          <p className="text-xs text-black/50">
                            Requested {item.requested_quantity} · Purchased {item.purchased_quantity}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(registry.id, item.product_id)}
                        className="text-xs font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 border-t border-black/10 pt-5 text-sm text-black/55">
                  No items in this registry yet.
                </p>
              )}
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-black/15 bg-[var(--color-cream)] p-8 text-center">
            <Gift size={32} className="mx-auto text-black/25" />
            <p className="mt-4 font-semibold">No gift registries yet.</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/50">
              Create your first registry above and share it with family and friends.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
