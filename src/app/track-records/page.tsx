"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import {
  Search,
  X,
  ShoppingBag,
  Truck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type OrderRecord = {
  id: string;
  recordCode: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  deliveryAddress: string;
  digitalAddress: string;
  orderStatus: string;
  shippingStatus: "received" | "shipped" | "delivered";
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
};

export default function TrackRecordsPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const pageSize = 10;

  useEffect(() => {
    const mapOrder = (order: any): OrderRecord => ({
      id: order.id,
      recordCode: order.record_code || `#BBS-${order.id.slice(0, 6).toUpperCase()}`,
      orderNumber: order.order_number || "",
      customerName: order.customer_name || "Customer",
      totalAmount: Number(order.total_amount || 0),
      deliveryAddress: order.delivery_address || "",
      digitalAddress: order.digital_address || "",
      orderStatus: order.order_status || "completed",
      shippingStatus: order.shipping_status || "received",
      createdAt: order.created_at,
      shippedAt: order.shipped_at,
      deliveredAt: order.delivered_at,
    });

    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          record_code,
          order_number,
          customer_name,
          total_amount,
          delivery_address,
          digital_address,
          order_status,
          shipping_status,
          shipped_at,
          delivered_at,
          created_at
        `)
        .eq("order_status", "completed")
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error.message);
        return;
      }

      setOrders((data || []).map(mapOrder));
    };

    fetchOrders();

    const channel = supabase
      .channel("track-records-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        fetchOrders
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const value = search.toLowerCase().trim();

    if (!value) return orders;

    return orders.filter((order) =>
      [
        order.recordCode,
        order.orderNumber,
        order.customerName,
        order.deliveryAddress,
        order.digitalAddress,
      ]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [orders, search]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));

  const shownOrders = filteredOrders.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const clearSearch = () => {
    setSearch("");
    setSearchOpen(false);
    setPage(1);
  };

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={0} />

      <section className="px-4 pb-20 pt-32 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">Track Records</h1>
              <p className="mt-2 text-sm text-black/50">
                Track your completed orders, delivery destination and shipping status.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`flex h-14 items-center overflow-hidden rounded-full border border-black/10 bg-white shadow-sm transition-all duration-500 ${
                  searchOpen ? "w-[360px] px-5" : "w-14 justify-center"
                }`}
              >
                <Search
                  size={22}
                  onClick={() => setSearchOpen(true)}
                  className="cursor-pointer"
                />

                {searchOpen && (
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search record, order, name or address..."
                    className="ml-3 w-full bg-transparent text-sm outline-none"
                  />
                )}
              </div>

              {searchOpen && (
                <button
                  onClick={clearSearch}
                  className="h-14 rounded-full border border-red-200 bg-white px-6 text-sm font-semibold text-red-500"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

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

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-black/50">
              Showing {shownOrders.length} of {filteredOrders.length} records
            </p>

            <div className="flex items-center gap-3">
              <button
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
  const shipped = order.shippingStatus === "shipped" || order.shippingStatus === "delivered";
  const delivered = order.shippingStatus === "delivered";

  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <div className="grid gap-6 xl:grid-cols-[320px_1fr_220px]">
        <div>
          <p className="text-2xl font-bold">{order.recordCode}</p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">Order ID:</span> {order.orderNumber}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Customer:</span> {order.customerName}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Total:</span> GH₵{order.totalAmount.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-black/50">
            {order.deliveryAddress}
          </p>
          <p className="mt-1 text-xs font-semibold text-black/40">
            Digital Address: {order.digitalAddress || "Not provided"}
          </p>
        </div>

        <div className="flex items-center">
          <div className="grid w-full grid-cols-3 items-start">
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

        <div className="flex items-center justify-center border-black/10 xl:border-l">
          <div className="text-center">
            <span
              className={`rounded-full px-5 py-2 text-sm font-semibold ${
                delivered
                  ? "bg-green-100 text-green-600"
                  : shipped
                  ? "bg-blue-100 text-blue-600"
                  : "bg-pink-100 text-pink-600"
              }`}
            >
              {delivered ? "Delivered" : shipped ? "Shipped" : "Received"}
            </span>

            <p className="mt-4 text-xs text-black/45">
              FIFO delivery queue
            </p>
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
  icon: any;
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
        className={`mt-3 text-sm font-semibold ${
          active ? "text-black" : "text-black/35"
        }`}
      >
        {title}
      </p>

      <p className="mt-1 text-xs text-black/45">
        {date ? new Date(date).toLocaleString() : "-"}
      </p>
    </div>
  );
}