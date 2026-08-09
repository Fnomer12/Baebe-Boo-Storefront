import Image from "next/image";
import PrintButton from "./PrintButton";
import { formatCedis } from "@/domain/money";
import {
  formatReceiptDate,
  formatReceiptDateTime,
  receiptTotals,
  statusLabel,
  type ReceiptOrder,
} from "@/lib/orders/receipt-order";

export type { ReceiptOrder };

/**
 * A mailbox that can actually receive customer replies, or nothing.
 *
 * Read at request time rather than through `NEXT_PUBLIC_*`, which the bundler
 * inlines at build time — an address configured after the last build would
 * otherwise never appear. `EMAIL_REPLY_TO` may carry a display name
 * ("Baebe Boo <hello@example.com>"), so only the address is shown.
 */
const supportEmail = (() => {
  const raw = (process.env.SUPPORT_EMAIL || process.env.EMAIL_REPLY_TO || "").trim();
  if (!raw) return null;
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim() || null;
})();

export default async function OrderReceipt({
  order,
  downloadHref,
}: {
  order: ReceiptOrder;
  /**
   * Where to fetch this receipt as a PDF. Passed in rather than derived,
   * because the two receipt pages authorise differently and each knows its own
   * URL — the account page by session, the public page by order plus email.
   */
  downloadHref?: string;
}) {
  const { subtotal, displayTotal } = receiptTotals(order);

  return (
    <div className="receipt-shell min-h-screen bg-[var(--color-cream)] px-4 pb-12 pt-6">
      <div className="receipt-page mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-black/10 pb-6">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-email.png"
              alt=""
              width={54}
              height={80}
              className="h-16 w-auto"
              priority
            />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#1c1518]">Baebe Boo</h1>
              <p className="mt-1 text-sm text-black/50">Premium baby &amp; family essentials</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-lg font-bold text-[#1c1518]">{order.orderNumber}</p>
            {order.recordCode ? <p className="text-sm text-black/50">{order.recordCode}</p> : null}
            <p className="mt-1 text-sm text-black/50">{formatReceiptDate(order.createdAt)}</p>
          </div>
        </header>

        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-black/50">Bill to</h2>
          <p className="mt-2 font-semibold text-[#1c1518]">{order.customerName || "Guest customer"}</p>
          {order.customerEmail ? <p className="text-sm text-black/70">{order.customerEmail}</p> : null}
          {order.customerPhone ? <p className="text-sm text-black/70">{order.customerPhone}</p> : null}
          {order.deliveryAddress ? (
            <p className="mt-2 text-sm leading-6 text-black/70">{order.deliveryAddress}</p>
          ) : null}
          {order.digitalAddress ? (
            <p className="text-sm text-black/50">Digital address: {order.digitalAddress}</p>
          ) : null}
        </section>

        {order.shop ? (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-black/50">From</h2>
            <p className="mt-2 font-semibold text-[#1c1518]">{order.shop.name}</p>
            {order.shop.address ? <p className="text-sm text-black/70">{order.shop.address}</p> : null}
            {order.shop.phone ? <p className="text-sm text-black/70">{order.shop.phone}</p> : null}
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-black/50">Items</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs font-bold uppercase tracking-[0.08em] text-black/50">
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4 text-right">Qty</th>
                  <th className="py-2 pr-4 text-right">Price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {order.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-sm text-black/50">
                      No item details available.
                    </td>
                  </tr>
                ) : (
                  order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 pr-4">{item.productName}</td>
                      <td className="py-3 pr-4 text-right">{item.quantity}</td>
                      <td className="py-3 pr-4 text-right">{formatCedis(item.unitPrice)}</td>
                      <td className="py-3 text-right font-medium">{formatCedis(item.totalPrice)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 border-t border-black/10 pt-5">
          <div className="flex justify-between py-1 text-sm text-black/60">
            <span>Subtotal</span>
            <span>{formatCedis(subtotal)}</span>
          </div>
          {order.appliedDiscount > 0 ? (
            <div className="flex justify-between py-1 text-sm text-[#b0617a]">
              <span>Discount</span>
              <span>-{formatCedis(order.appliedDiscount)}</span>
            </div>
          ) : null}
          {order.deliveryFee > 0 ? (
            <div className="flex justify-between py-1 text-sm text-black/60">
              <span>Delivery</span>
              <span>{formatCedis(order.deliveryFee)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-black/10 pt-3 text-lg font-bold text-[#1c1518]">
            <span>Total</span>
            <span>{formatCedis(displayTotal)}</span>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-black/50">Payment</h2>
          {order.payments.length === 0 ? (
            <p className="mt-2 text-sm text-black/70">
              Status:{" "}
              <span className="capitalize">{statusLabel(order.paymentStatus)}</span>
            </p>
          ) : (
            <ul className="mt-2 list-none space-y-1 text-sm text-black/70">
              {order.payments.map((payment) => (
                <li key={payment.id}>
                  <span className="capitalize">{payment.provider}</span>{" "}
                  <span className="text-black/50">({payment.providerReference})</span>
                  <span className="font-medium"> — {formatCedis(payment.amount)}</span>
                  <span className="capitalize"> — {statusLabel(payment.status)}</span>
                  {payment.verifiedAt ? (
                    <span className="text-black/50">
                      {" "}
                      at {formatReceiptDateTime(payment.verifiedAt)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-black/70">
            Order status: <span className="capitalize">{statusLabel(order.orderStatus)}</span>
          </p>
        </section>

        <footer className="mt-10 border-t border-black/10 pt-6 text-center text-sm text-black/50">
          <p className="font-medium text-[#1c1518]">Thank you for shopping with Baebe Boo.</p>
          {/*
            This used to print `hello@baebeboo.com` unconditionally, while every
            message went out from `no-reply@` with no Reply-To — so the address
            on the receipt was a promise the shop was not keeping. It is now
            shown only when someone has configured a mailbox that can receive.
          */}
          {supportEmail ? (
            <p className="mt-1 text-xs">If you have questions, contact us at {supportEmail}</p>
          ) : (
            <p className="mt-1 text-xs">
              If you have questions, just reply to your order confirmation email.
            </p>
          )}
        </footer>
      </div>

      <div className="mx-auto mt-6 flex max-w-3xl justify-end gap-3">
        {downloadHref ? (
          <a
            href={downloadHref}
            download
            className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-bold text-[#1c1518] shadow-sm ring-1 ring-black/10 hover:bg-[var(--color-cream)]"
          >
            Download PDF
          </a>
        ) : null}
        <PrintButton />
      </div>

      <style>{`
        @media print {
          .receipt-shell {
            background: #ffffff !important;
            padding: 0 !important;
          }
          .receipt-page {
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            max-width: none !important;
          }
          .receipt-page + div,
          .receipt-shell > div:last-child {
            display: none !important;
          }
          body {
            background: #ffffff !important;
          }
        }
      `}</style>
    </div>
  );
}
