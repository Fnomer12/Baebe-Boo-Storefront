"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type SavedAddress = {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  region: string;
  digital_address: string | null;
  delivery_instructions: string | null;
  is_default: boolean;
};

const emptyAddress: SavedAddress = {
  id: "",
  label: "",
  recipient_name: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  region: "",
  digital_address: "",
  delivery_instructions: "",
  is_default: false,
};

export default function AddressManager({ addresses }: { addresses: SavedAddress[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SavedAddress>(emptyAddress);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");

    try {
      const response = await fetch(
        editing.id ? `/api/account/addresses/${editing.id}` : "/api/account/addresses",
        {
          method: editing.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: form.get("label"),
            recipientName: form.get("recipientName"),
            phone: form.get("phone"),
            addressLine1: form.get("addressLine1"),
            addressLine2: form.get("addressLine2"),
            city: form.get("city"),
            region: form.get("region"),
            digitalAddress: form.get("digitalAddress"),
            deliveryInstructions: form.get("deliveryInstructions"),
            isDefault: form.get("isDefault") === "on",
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(result?.message || "We could not save this address.");
        return;
      }
      setEditing(emptyAddress);
      setMessage("Address saved.");
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function deleteAddress(id: string) {
    if (!window.confirm("Remove this saved address?")) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/account/addresses/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(result?.message || "We could not remove this address.");
        return;
      }
      if (editing.id === id) setEditing(emptyAddress);
      setMessage("Address removed.");
      router.refresh();
    } catch {
      setMessage("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-brand)]";

  return (
    <div className="mt-9 grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        {addresses.length ? addresses.map((address) => (
          <article key={address.id} className="rounded-3xl bg-[var(--color-cream)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{address.label || address.recipient_name}</p>
                {address.is_default ? <span className="mt-2 inline-flex rounded-full bg-[var(--color-brand-tint)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-deep)]">Default</span> : null}
              </div>
              <div className="flex gap-3 text-xs font-semibold">
                <button type="button" onClick={() => setEditing(address)} className="text-[var(--color-brand-deep)]">Edit</button>
                <button type="button" onClick={() => deleteAddress(address.id)} className="text-red-700">Remove</button>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-black/55">{address.address_line_1}{address.address_line_2 ? `, ${address.address_line_2}` : ""}<br />{address.city}, {address.region}{address.digital_address ? ` · ${address.digital_address}` : ""}<br />{address.phone}</p>
          </article>
        )) : <p className="rounded-3xl border border-dashed border-black/15 bg-[var(--color-cream)] p-6 text-sm text-black/55">No saved addresses yet.</p>}
      </div>

      <form onSubmit={saveAddress} className="rounded-3xl border border-black/10 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{editing.id ? "Update address" : "Add an address"}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">Label<input className={inputClass} name="label" maxLength={40} defaultValue={editing.label || ""} key={`label-${editing.id}`} placeholder="Home" /></label>
          <label className="text-xs font-semibold">Recipient name<input className={inputClass} name="recipientName" required minLength={2} maxLength={100} defaultValue={editing.recipient_name} key={`name-${editing.id}`} /></label>
          <label className="text-xs font-semibold">Phone * (SMS updates)<input className={inputClass} name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="+233" title="Ghana number starting with +233" defaultValue={editing.phone} key={`phone-${editing.id}`} /><span className="mt-1 block text-[11px] font-normal leading-4 text-black/50">We send order and delivery updates by SMS to this number.</span></label>
          <label className="text-xs font-semibold">GhanaPost GPS<input className={inputClass} name="digitalAddress" maxLength={24} defaultValue={editing.digital_address || ""} key={`gps-${editing.id}`} placeholder="GA-183-8164" /></label>
          <label className="text-xs font-semibold sm:col-span-2">Address line 1<input className={inputClass} name="addressLine1" required minLength={4} maxLength={160} defaultValue={editing.address_line_1} key={`line1-${editing.id}`} /></label>
          <label className="text-xs font-semibold sm:col-span-2">Address line 2<input className={inputClass} name="addressLine2" maxLength={160} defaultValue={editing.address_line_2 || ""} key={`line2-${editing.id}`} /></label>
          <label className="text-xs font-semibold">City<input className={inputClass} name="city" required minLength={2} maxLength={80} defaultValue={editing.city} key={`city-${editing.id}`} /></label>
          <label className="text-xs font-semibold">Region<input className={inputClass} name="region" required minLength={2} maxLength={80} defaultValue={editing.region} key={`region-${editing.id}`} /></label>
          <label className="text-xs font-semibold sm:col-span-2">Delivery instructions<textarea className={inputClass} name="deliveryInstructions" maxLength={500} defaultValue={editing.delivery_instructions || ""} key={`instructions-${editing.id}`} rows={3} /></label>
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" name="isDefault" defaultChecked={editing.is_default} key={`default-${editing.id}`} /> Use as my default address</label>
        <div className="mt-6 flex flex-wrap gap-3">
          <button disabled={pending} className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save address"}</button>
          {editing.id ? <button type="button" onClick={() => setEditing(emptyAddress)} className="rounded-full border border-black/15 px-6 py-3 text-sm font-semibold">Cancel</button> : null}
        </div>
        <p aria-live="polite" className="mt-4 min-h-5 text-sm text-black/60">{message}</p>
      </form>
    </div>
  );
}
