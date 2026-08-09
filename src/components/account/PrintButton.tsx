"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center justify-center rounded-full bg-[#1c1518] px-6 text-sm font-bold text-white transition hover:opacity-90"
    >
      Print receipt
    </button>
  );
}
