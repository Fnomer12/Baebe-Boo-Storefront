import { notFound } from "next/navigation";
import Link from "next/link";
import OrderReceipt from "@/components/account/OrderReceipt";
import { authorizeReceiptBySession } from "@/lib/orders/receipt-order";

export default async function AccountReceiptPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await authorizeReceiptBySession(orderNumber);

  if (!order) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)]">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Link
          href="/account/orders"
          className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1c1518] shadow-sm ring-1 ring-black/5 hover:bg-[var(--color-cream)]"
        >
          ← Back to orders
        </Link>
      </div>
      <OrderReceipt
        order={order}
        downloadHref={`/account/orders/${encodeURIComponent(orderNumber)}/receipt/pdf`}
      />
    </div>
  );
}
