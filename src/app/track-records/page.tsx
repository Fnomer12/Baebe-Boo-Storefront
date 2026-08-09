"use client";

import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import {
  ShoppingBag,
  Truck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type OrderRecord = {
  id: string;
  recordCode: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  deliveryAddress: string;
  digitalAddress: string;
  orderStatus: string;
  shippingStatus: "received" | "shipped" | "delivered" | "cancelled";
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
};

type OrderApiRecord = {
  id: string;
  order_number?: string | null;
  customer_name?: string | null;
  total_amount?: number | string | null;
  delivery_address?: string | null;
  digital_address?: string | null;
  order_status?: string | null;
  shipping_status?: OrderRecord["shippingStatus"] | null;
  created_at: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
};

type TrackingResponse = { message?: string; orders?: OrderApiRecord[] };

export default function TrackRecordsPage() {
  const [orders, setOrders] = useState<OrderApiRecord[]>([]);
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const pageSize = 10;

  const lookupOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, email }),
      });
      const result = (await response.json()) as TrackingResponse;

      if (!response.ok) {
        setOrders([]);
        setError(result.message || "Order not found.");
        return;
      }

      setOrders(result.orders || []);
      setPage(1);
    } catch {
      setError("Could not look up the order.");
    } finally {
      setLoading(false);
    }
  };

  const mapOrder = (order: OrderApiRecord): OrderRecord => ({
      id: order.id,
      recordCode: order.order_number
        ? `#${order.order_number}`
        : `#BBS-${order.id.slice(0, 6).toUpperCase()}`,
      orderNumber: order.order_number || "",
      customerName: order.customer_name || "Customer",
      totalAmount: Number(order.total_amount || 0),
      deliveryAddress: order.delivery_address || "",
      digitalAddress: order.digital_address || "",
      orderStatus: order.order_status || "completed",
      shippingStatus: order.shipping_status || "received",
      createdAt: order.created_at,
      shippedAt: order.shipped_at ?? null,
      deliveredAt: order.delivered_at ?? null,
    });

  const filteredOrders = useMemo(() => {
    return orders.map(mapOrder);
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));

  const shownOrders = filteredOrders.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={0} />

      <section className="px-3 pb-12 pt-24 sm:px-4 sm:pb-16 sm:pt-28 md:px-6 md:pt-32">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Track Records
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
                Enter your order number and checkout email to view delivery status.
              </p>
            </div>

            <form onSubmit={lookupOrder} className="grid w-full gap-3 sm:grid-cols-[1fr_1fr_auto] lg:w-auto">
              <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="Order number" className="h-14 rounded-full border border-black/10 bg-white px-5 text-sm outline-none" required />
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Checkout email" className="h-14 rounded-full border border-black/10 bg-white px-5 text-sm outline-none" required />
              <button disabled={loading} className="h-14 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Looking up..." : "Track order"}</button>
            </form>
          </div>

          {error && <div className="mb-6 rounded-3xl bg-red-50 p-4 text-sm font-semibold text-red-600">{error}</div>}

          {shownOrders.length === 0 ? (
            <div className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/50">
              No track records found.
            </div>
          ) : (
            <div className="space-y-4">
              {shownOrders.map((order) => (
                <TrackCard key={order.id} order={order} />
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-black/50">
              Showing {shownOrders.length} of {filteredOrders.length} records
            </p>

            <div className="flex items-center gap-3">
              <button
                aria-label="Previous order"
                disabled={page === 1}
                onClick={() => setPage((prev) => prev - 1)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>

              <span className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white">
                {page} / {totalPages}
              </span>

              <button
                aria-label="Next order"
                disabled={page === totalPages}
                onClick={() => setPage((prev) => prev + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function TrackCard({ order }: { order: OrderRecord }) {
  const shipped =
    order.shippingStatus === "shipped" || order.shippingStatus === "delivered";
  const delivered = order.shippingStatus === "delivered";

  return (
    <div className="rounded-[1.75rem] border border-black/10 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2rem]">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <p className="break-words text-2xl font-bold">{order.recordCode}</p>

          <p className="mt-3 break-words text-sm">
            <span className="font-semibold">Order ID:</span>{" "}
            {order.orderNumber}
          </p>

          <p className="mt-2 break-words text-sm">
            <span className="font-semibold">Customer:</span>{" "}
            {order.customerName}
          </p>

          <p className="mt-2 text-sm">
            <span className="font-semibold">Total:</span>{" "}
            GH₵{order.totalAmount.toLocaleString()}
          </p>

          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-black/50">
            {order.deliveryAddress || "No delivery address"}
          </p>

          {order.digitalAddress && (
            <p className="mt-1 break-words text-xs font-semibold leading-5 text-black/40">
              GhanaPost GPS: {order.digitalAddress}
            </p>
          )}
        </div>

        <div className="flex items-center overflow-x-auto pb-2 xl:overflow-visible xl:pb-0">
          <div className="grid min-w-[520px] w-full grid-cols-3 items-start gap-3 sm:min-w-0">
            <Step
              active
              icon={ShoppingBag}
              title="Order Received"
              date={order.createdAt}
            />

            <Step
              active={shipped}
              icon={Truck}
              title="Shipped / Dispatched"
              date={order.shippedAt}
            />

            <Step
              active={delivered}
              icon={CheckCircle2}
              title="Delivered"
              date={order.deliveredAt}
            />
          </div>
        </div>

        <div className="flex items-center justify-start border-black/10 pt-2 xl:justify-center xl:border-l xl:pt-0">
          <div className="text-left xl:text-center">
            <span
              className={`inline-flex rounded-full px-5 py-2 text-sm font-semibold ${
                delivered
                  ? "bg-green-100 text-green-600"
                  : shipped
                  ? "bg-blue-100 text-blue-600"
                  : "bg-pink-100 text-pink-600"
              }`}
            >
              {delivered ? "Delivered" : shipped ? "Shipped" : "Received"}
            </span>

            <p className="mt-4 text-xs text-black/45">FIFO delivery queue</p>
          </div>
        </div>
      </div>
    </div>
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
        {date ? new Date(date).toLocaleString() : "-"}
      </p>
    </div>
  );
}
