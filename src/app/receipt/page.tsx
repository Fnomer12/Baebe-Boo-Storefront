import Link from "next/link";
import OrderReceipt from "@/components/account/OrderReceipt";
import { authorizeReceiptByEmail } from "@/lib/orders/receipt-order";

export default async function PublicReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; email?: string }>;
}) {
  const { order, email } = await searchParams;

  if (!order || !email) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f5f0] px-4 text-center">
        <h1 className="text-2xl font-semibold text-[#1c1518]">Receipt lookup</h1>
        <p className="mt-3 max-w-md text-sm text-black/55">
          Please provide an order number and the email used at checkout.
        </p>
        <Link
          href="/orders/track"
          className="mt-6 inline-flex rounded-full bg-[#1c1518] px-6 py-3 text-sm font-semibold text-white"
        >
          Track your order
        </Link>
      </main>
    );
  }

  const receiptOrder = await authorizeReceiptByEmail(order, email);

  if (!receiptOrder) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f5f0] px-4 text-center">
        <h1 className="text-2xl font-semibold text-[#1c1518]">Receipt not found</h1>
        <p className="mt-3 max-w-md text-sm text-black/55">
          We could not find a receipt matching that order number and email. Double-check your details.
        </p>
        <Link
          href={`/receipt?order=${encodeURIComponent(order)}`}
          className="mt-6 inline-flex rounded-full bg-[#1c1518] px-6 py-3 text-sm font-semibold text-white"
        >
          Try again
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f5f0]">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Link
          href="/orders/track"
          className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1c1518] shadow-sm ring-1 ring-black/5 hover:bg-[#f8f5f0]"
        >
          ← Back to tracking
        </Link>
      </div>
      <OrderReceipt
        order={receiptOrder}
        downloadHref={`/receipt/pdf?order=${encodeURIComponent(order)}&email=${encodeURIComponent(email)}`}
      />
    </div>
  );
}
