"use client";

import { Ticket } from "lucide-react";
import { formatCedis } from "@/domain/money";

export type Voucher = {
  id: string;
  code: string;
  initialValue: number;
  balance: number;
  /** Always "GHS". Kept only because the column still exists; never rendered. */
  currency: string;
  recipientEmail: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function VoucherWallet({ vouchers }: { vouchers: Voucher[] }) {
  if (vouchers.length === 0) {
    return (
      <div className="mt-9 rounded-3xl border border-dashed border-black/15 bg-[var(--color-cream)] px-6 py-14 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#28637d]">
          <Ticket size={24} />
        </div>
        <h2 className="mt-5 text-xl font-semibold">No gift vouchers yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50">
          Gift vouchers you receive or purchase will appear here. Redeem them at checkout.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-9 space-y-4">
      {vouchers.map((voucher) => (
        <div
          key={voucher.id}
          className="flex flex-col gap-4 rounded-3xl border border-black/[0.07] bg-[var(--color-cream)] p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[#28637d]">
              <Ticket size={22} />
            </div>
            <div>
              <p className="font-mono text-base font-semibold uppercase tracking-wide">{voucher.code}</p>
              <p className="mt-0.5 text-xs text-black/50">
                {voucher.status === "active" ? "Active" : <span className="capitalize">{voucher.status}</span>}
                {voucher.expiresAt ? ` · Expires ${formatDate(voucher.expiresAt)}` : ""}
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xl font-semibold">{formatCedis(voucher.balance)}</p>
            <p className="text-xs text-black/50">of {formatCedis(voucher.initialValue)} remaining</p>
          </div>
        </div>
      ))}
      <p className="text-sm text-black/55">
        Enter your voucher code on the checkout page to redeem the balance against your order.
      </p>
    </div>
  );
}
