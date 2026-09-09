import type { CounterSaleReceipt } from "@/lib/counter/sales";
import { formatCedis } from "@/domain/counter/money";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  visa: "Card",
  momo: "Mobile money",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CounterDigitalReceipt({ receipt }: { receipt: CounterSaleReceipt }) {
  return (
    <main className="min-h-screen bg-[#f8f5f0] px-4 py-8 text-[#1c1518] sm:py-12">
      <article className="mx-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-sm sm:p-10">
        <header className="border-b border-black/10 pb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">Baebe Boo</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Digital receipt</h1>
          <p className="mt-2 text-sm text-black/50">{receipt.orderNumber}</p>
          <p className="mt-1 text-sm text-black/50">{formatDate(receipt.soldAt)}</p>
        </header>

        <section className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">Customer</p>
          <p className="mt-2 font-semibold">{receipt.customerName || "Walk-in Customer"}</p>
          {receipt.customerPhone ? <p className="text-sm text-black/55">{receipt.customerPhone}</p> : null}
        </section>

        <ul className="mt-6 divide-y divide-black/[0.08] border-y border-black/10">
          {receipt.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-4 py-4 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{line.productName}</p>
                {line.variantLabel ? <p className="text-xs text-black/50">{line.variantLabel}</p> : null}
                <p className="mt-1 text-xs text-black/50">{line.quantity} × {formatCedis(line.price)}</p>
              </div>
              <p className="shrink-0 font-semibold">{formatCedis(line.lineTotal)}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">Payment</p>
            <p className="mt-1 font-semibold">{PAYMENT_LABEL[receipt.paymentMethod] || receipt.paymentMethod}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">Total</p>
            <p className="mt-1 text-2xl font-bold">{formatCedis(receipt.total)}</p>
          </div>
        </div>

        <footer className="mt-8 border-t border-black/10 pt-6 text-center text-sm text-black/50">
          <p className="font-medium text-[#1c1518]">Thank you for shopping with Baebe Boo.</p>
          <p className="mt-1 text-xs">Keep this digital copy for your records.</p>
        </footer>
      </article>
    </main>
  );
}
