import { getPublicCounterSaleReceipt } from "@/lib/counter/sales";
import { CounterError } from "@/lib/counter/errors";
import { verifyCounterReceiptToken } from "@/lib/counter/receipt-link";
import CounterDigitalReceipt from "@/components/counter/CounterDigitalReceipt";

export default async function CounterDigitalReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; token?: string }>;
}) {
  const { order, token } = await searchParams;
  const orderNumber = order?.trim() || "";

  if (!orderNumber || !token || !verifyCounterReceiptToken(orderNumber, token)) {
    return <ReceiptLinkError message="This digital receipt link is invalid or has expired." />;
  }

  let receipt: Awaited<ReturnType<typeof getPublicCounterSaleReceipt>> | null = null;
  let errorMessage = "";
  try {
    receipt = await getPublicCounterSaleReceipt(orderNumber);
  } catch (error) {
    errorMessage = error instanceof CounterError ? error.message : "This digital receipt is not available.";
  }
  if (!receipt) return <ReceiptLinkError message={errorMessage || "This digital receipt is not available."} />;
  return <CounterDigitalReceipt receipt={receipt} />;
}

function ReceiptLinkError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f5f0] px-4 text-center text-[#1c1518]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">Baebe Boo</p>
        <h1 className="mt-3 text-2xl font-semibold">Digital receipt unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">{message}</p>
      </section>
    </main>
  );
}
