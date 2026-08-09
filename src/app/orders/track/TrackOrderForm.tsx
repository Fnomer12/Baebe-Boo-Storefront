"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingBag, Truck, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type OrderApiRecord = {
  id: string;
  order_number?: string | null;
  customer_name?: string | null;
  total_amount?: number | string | null;
  delivery_address?: string | null;
  digital_address?: string | null;
  order_status?: string | null;
  shipping_status?: "received" | "shipped" | "delivered" | "cancelled" | null;
  created_at: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
};

type TrackingResponse = { message?: string; orders?: OrderApiRecord[] };

export default function TrackOrderForm() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(() => searchParams.get("order") ?? "");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<OrderApiRecord | null>(null);

  async function lookupOrder(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setOrder(null);
    setLoading(true);

    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, email }),
      });
      const result = (await response.json()) as TrackingResponse;

      if (!response.ok) {
        setError(result.message || "Order not found.");
        return;
      }

      setOrder(result.orders?.[0] ?? null);
    } catch {
      setError("Could not look up the order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Track your order
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-black/50">
          Enter your order number and checkout email to view delivery status.
        </p>
      </div>

      <form
        onSubmit={lookupOrder}
        className="mx-auto grid w-full max-w-xl gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="Order number"
          className="h-14 rounded-full border border-black/10 bg-white px-5 text-sm outline-none focus:border-black/30"
          required
        />
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="Checkout email"
          className="h-14 rounded-full border border-black/10 bg-white px-5 text-sm outline-none focus:border-black/30"
          required
        />
        <button
          disabled={loading}
          className="h-14 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Tracking…" : "Track"}
        </button>
      </form>

      {error && (
        <div className="mx-auto mt-6 max-w-xl rounded-3xl bg-red-50 p-4 text-center text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      {order && (
        <div className="mt-8">
          <TrackCard order={order} />
        </div>
      )}
    </>
  );
}

function TrackCard({ order }: { order: OrderApiRecord }) {
  const shipped =
    order.shipping_status === "shipped" || order.shipping_status === "delivered";
  const delivered = order.shipping_status === "delivered";
  const cancelled = order.shipping_status === "cancelled";

  return (
    <article className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-sm sm:p-7 md:rounded-[2rem]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-2xl font-bold">
            #{order.order_number || order.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">Customer:</span>{" "}
            {order.customer_name || "Customer"}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Total:</span>{" "}
            GH₵{Number(order.total_amount || 0).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-black/50">
            {order.delivery_address || "No delivery address"}
          </p>
          {order.digital_address && (
            <p className="mt-1 break-words text-xs font-semibold leading-5 text-black/40">
              GhanaPost GPS: {order.digital_address}
            </p>
          )}
        </div>

        <div className="flex items-center justify-start sm:justify-end">
          <span
            className={`inline-flex rounded-full px-5 py-2 text-sm font-semibold ${
              cancelled
                ? "bg-black/5 text-black/50"
                : delivered
                  ? "bg-green-100 text-green-600"
                  : shipped
                    ? "bg-blue-100 text-blue-600"
                    : "bg-pink-100 text-pink-600"
            }`}
          >
            {cancelled ? "Cancelled" : delivered ? "Delivered" : shipped ? "Shipped" : "Received"}
          </span>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto pb-2">
        <div className="grid min-w-[320px] grid-cols-3 items-start gap-3">
          <Step
            active
            icon={ShoppingBag}
            title="Order Received"
            date={order.created_at}
          />
          <Step
            active={shipped}
            icon={Truck}
            title="Shipped / Dispatched"
            date={order.shipped_at ?? null}
          />
          <Step
            active={delivered}
            icon={CheckCircle2}
            title="Delivered"
            date={order.delivered_at ?? null}
          />
        </div>
      </div>
    </article>
  );
}

function Step({
  active,
  icon: Icon,
  title,
  date,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  date: string | null;
}) {
  return (
    <div className="relative text-center">
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border ${
          active
            ? "border-black bg-black text-white"
            : "border-black/10 bg-[#FAFAFA] text-black/30"
        }`}
      >
        <Icon size={20} />
      </div>

      <p
        className={`mt-3 text-xs font-semibold leading-5 sm:text-sm ${
          active ? "text-black" : "text-black/35"
        }`}
      >
        {title}
      </p>

      <p className="mt-1 text-[11px] leading-4 text-black/45 sm:text-xs">
        {date ? new Date(date).toLocaleString() : "—"}
      </p>
    </div>
  );
}
