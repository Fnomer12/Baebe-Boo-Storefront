import Link from "next/link";

export type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number | null;
};

export type Order = {
  id: string;
  order_number: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  created_at: string;
  order_items: OrderItem[] | null;
};

export default function OrderHistory({ orders }: { orders: Order[] }) {
  if (!orders.length) {
    return (
      <div className="mt-9 rounded-3xl border border-dashed border-black/15 bg-[var(--color-cream)] p-8 text-center">
        <p className="font-semibold">No orders yet.</p>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/50">
          Your online orders will appear here after checkout.
        </p>
        <Link href="/store" className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-9 space-y-4">
      {orders.map((order) => (
        <article key={order.id} className="rounded-3xl bg-[var(--color-cream)] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{order.order_number}</p>
              <p className="mt-1 text-xs text-black/45">
                {new Date(order.created_at).toLocaleDateString("en-GH", { dateStyle: "medium" })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">GH₵{Number(order.total_amount).toFixed(2)}</p>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <StatusBadge status={order.order_status} />
                <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-black/60">
                  {String(order.payment_status).replaceAll("_", " ")}
                </span>
              </div>
            </div>
          </div>

          {order.order_items && order.order_items.length > 0 ? (
            <ul className="mt-5 space-y-2 border-t border-black/10 pt-4">
              {order.order_items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-black/70">
                    {item.product_name} <span className="text-black/40">× {item.quantity}</span>
                  </span>
                  <span className="font-medium">GH₵{Number(item.total_price ?? item.unit_price ?? 0).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/orders/track?order=${order.order_number}`}
              className="inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white"
            >
              Track order
            </Link>
            <Link
              href={`/account/orders/${order.order_number}/receipt`}
              className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-black"
            >
              Receipt
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = String(status).replaceAll("_", " ");
  const color =
    status === "delivered" || status === "completed"
      ? "bg-green-100 text-green-800"
      : status === "cancelled" || status === "refunded"
        ? "bg-red-100 text-red-800"
        : status === "shipped" || status === "dispatched"
          ? "bg-[var(--color-brand-tint)] text-[var(--color-brand-deep)]"
          : "bg-amber-100 text-amber-800";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${color}`}>
      {label}
    </span>
  );
}
