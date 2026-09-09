"use client";

import { useState } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import { AdminModal } from "@/components/admin/AdminWorkspacePrimitives";
import { sendLocalPrintJob } from "@/lib/labels/local-printer";
import CounterPrinterSetup from "./CounterPrinterSetup";

export type CounterReceiptForPrint = {
  id: string;
  orderNumber: string;
  customerName: string;
  paymentMethod: string;
  total: number;
  soldAt: string;
  customerPhone?: string;
  lines: {
    id: string;
    productName: string;
    variantLabel?: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }[];
};

export default function CounterReceiptPrintModal({
  open,
  receipt,
  onClose,
}: {
  open: boolean;
  receipt: CounterReceiptForPrint | null;
  onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);
  const [printerSetupOpen, setPrinterSetupOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [verifiedPrinter, setVerifiedPrinter] = useState("");

  async function printReceipt() {
    if (!receipt) return;
    if (!verifiedPrinter) {
      setPrinterSetupOpen(true);
      setError("Connect this workstation's printer and complete its physical test first.");
      return;
    }
    setPrinting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/counter/sales/${receipt.id}/receipt/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transport: "local", printer: verifiedPrinter }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; title?: string; jobBase64?: string } | null;
      if (!response.ok) {
        if (response.status === 428 || response.status === 409) setPrinterSetupOpen(true);
        throw new Error(payload?.message || "The receipt could not be printed.");
      }
      if (!payload?.jobBase64) throw new Error("The server did not return a printable receipt job.");
      const printed = await sendLocalPrintJob({ printer: verifiedPrinter, title: payload.title || "Baebe Boo counter receipt", jobBase64: payload.jobBase64 });
      setNotice(`Receipt sent to ${printed.printer} (${printed.jobId}).`);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "The receipt could not be printed.");
    } finally {
      setPrinting(false);
    }
  }

  if (!receipt) return null;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      subtitle="Cash payment complete"
      title="Print this receipt?"
      size="md"
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-brand-deep)]">
                Receipt ready
              </p>
              <p className="mt-1 truncate font-semibold">{receipt.orderNumber}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                {receipt.customerName || "Walk-in Customer"}
              </p>
            </div>
            <strong className="shrink-0 text-2xl">GHS {receipt.total.toFixed(2)}</strong>
          </div>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            The cash sale is recorded. Print a long receipt for the customer, or ignore this step.
          </p>
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
            <CheckCircle2 size={16} />
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
            {error}
          </p>
        )}

        <CounterPrinterSetup
          open={printerSetupOpen}
          onVerified={(printer) => {
            setVerifiedPrinter(printer);
            setPrinterSetupOpen(false);
            setError("");
            setNotice("Printer verified. Press Print Receipt to send this receipt.");
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void printReceipt()}
            disabled={printing}
            className="admin-button flex min-h-12 items-center justify-center gap-2 disabled:opacity-50"
          >
            <Printer size={18} />
            {printing ? "Printing…" : "Print Receipt"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={printing}
            className="admin-button admin-button-secondary min-h-12 disabled:opacity-50"
          >
            Ignore
          </button>
        </div>
        <p className="text-xs leading-5 text-[var(--color-ink-soft)]">
          Receipt paper is 80 mm wide with a 160 mm minimum length, growing for larger baskets. The QR code opens a digital copy of this receipt.
        </p>
      </div>
    </AdminModal>
  );
}
