"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Cable, CheckCircle2, CircleAlert, Laptop, Printer, RefreshCw } from "lucide-react";
import { formatCedis } from "@/domain/money";
import { getLocalPrinterStatus, sendLocalPrintJob, type LocalPrinterStatus } from "@/lib/labels/local-printer";

type LabelVariant = { id: string; sku: string; title: string; price: number };
type LabelProduct = { id: string; name: string; variants: LabelVariant[] };
type Selection = Record<string, { checked: boolean; copies: number }>;
type SetupState = "checking" | "choose" | "testing" | "confirm" | "ready" | "error";

/** Connect the workstation printer, verify a physical test label, then print 30×50mm labels. */
export default function LabelPrintWorkspace() {
  const [products, setProducts] = useState<LabelProduct[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<LocalPrinterStatus | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [setupError, setSetupError] = useState("");
  const [testJob, setTestJob] = useState("");
  const [labelsUnlocked, setLabelsUnlocked] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshPrinterStatus = useCallback(async () => {
    setSetupState("checking");
    setSetupError("");
    try {
      const payload = await getLocalPrinterStatus();
      setPrinterStatus(payload);
      const preferred = payload.printers.find((printer) => printer.connected);
      setSelectedPrinter(preferred?.name || "");
      setSetupState("choose");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "The local printer connector is unavailable.");
      setSetupState("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshPrinterStatus(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshPrinterStatus]);

  useEffect(() => {
    if (!labelsUnlocked) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/products?pageSize=200", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          products?: Array<{ id?: unknown; name?: unknown; variants?: Array<{ id?: unknown; sku?: unknown; title?: unknown; price?: unknown }> }>;
        };
        if (!response.ok) throw new Error("unavailable");
        if (cancelled) return;
        setProducts((payload.products || []).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? "Product"),
          variants: (row.variants || []).map((variant) => ({
            id: String(variant.id ?? ""), sku: String(variant.sku ?? ""), title: String(variant.title ?? "Default"), price: Number(variant.price ?? 0),
          })).filter((variant) => variant.id && variant.sku),
        })).filter((row) => row.id && row.variants.length > 0));
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, [labelsUnlocked]);

  async function printLabels() {
    if (!selectedPrinter || !labelsUnlocked) {
      setError("Connect the printer and complete its physical test before printing labels.");
      return;
    }
    const items: Array<{ productId: string; variantId: string; copies: number }> = [];
    for (const product of products || []) {
      for (const variant of product.variants) {
        const entry = selection[variant.id];
        if (entry?.checked) items.push({ productId: product.id, variantId: variant.id, copies: entry.copies });
      }
    }
    if (items.length === 0) {
      setError("Tick at least one version first.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, print: true, transport: "local", printer: selectedPrinter }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; printer?: string; title?: string; jobBase64?: string; count?: number };
      if (!response.ok) throw new Error(result.message || "The printer could not be reached.");
      if (!result.jobBase64) throw new Error("The server did not return a printable label job.");
      const printed = await sendLocalPrintJob({ printer: selectedPrinter, title: result.title || "Baebe Boo shelf labels", jobBase64: result.jobBase64 });
      setNotice(`${result.count || "Label"} label${result.count === 1 ? "" : "s"} sent to ${printed.printer} (${printed.jobId}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Labels could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function testPrinter() {
    if (!selectedPrinter) { setSetupError("Choose the connected printer first."); return; }
    setSetupState("testing"); setSetupError(""); setTestJob("");
    try {
      const response = await fetch("/api/admin/printer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-job" }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; title?: string; jobBase64?: string };
      if (!response.ok) throw new Error(result.message || "The test page could not be sent.");
      if (!result.jobBase64) throw new Error("The server did not return a printer test job.");
      const printed = await sendLocalPrintJob({ printer: selectedPrinter, title: result.title || "Baebe Boo printer connection test", jobBase64: result.jobBase64 });
      setTestJob(printed.jobId); setSetupState("confirm");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "The test page could not be sent.");
      setSetupState("choose");
    }
  }

  function choosePrinter(name: string) {
    setSelectedPrinter(name); setLabelsUnlocked(false); setSetupState("choose"); setSetupError(""); setTestJob(""); setError(""); setNotice("");
  }

  async function confirmPrinter() {
    setSetupState("testing"); setSetupError("");
    try {
      const response = await fetch("/api/admin/printer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", printer: selectedPrinter, bridgeJobId: testJob }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "The printer verification could not be saved.");
      setLabelsUnlocked(true); setSetupState("ready"); setError(""); setNotice("");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "The printer verification could not be saved.");
      setSetupState("confirm");
    }
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (products || []).filter((product) => product.name.toLowerCase().includes(normalized) || product.variants.some((variant) => variant.sku.toLowerCase().includes(normalized)));
  }, [products, query]);
  const stickerCount = Object.values(selection).reduce((sum, entry) => sum + (entry.checked ? Math.max(1, entry.copies) : 0), 0);
  const selectedPrinterDetails = printerStatus?.printers.find((printer) => printer.name === selectedPrinter);
  const connectedPrinters = printerStatus?.printers.filter((printer) => printer.connected) || [];

  function toggleVariant(id: string) {
    setSelection((current) => { const entry = current[id] || { checked: false, copies: 1 }; return { ...current, [id]: { ...entry, checked: !entry.checked } }; });
  }

  function setCopies(id: string, copies: number) {
    const safe = Number.isFinite(copies) ? Math.min(50, Math.max(1, Math.floor(copies))) : 1;
    setSelection((current) => ({ ...current, [id]: { checked: true, copies: safe } }));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-8">
      <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/BaebeAdmin/products" className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-semibold text-[#28637d] hover:text-[#101820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2"><ArrowLeft size={16} />Back to products</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Catalog operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Print shelf labels</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Connect this workstation&apos;s printer, verify one physical test label, then print 30 × 50 mm labels.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-sm shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f5f5] text-[#28637d]"><Printer size={17} /></span><span><strong className="block">{selectedPrinter || "No printer selected"}</strong><span className="text-xs text-black/45">{printerStatus?.host || "Workstation not detected"} · 30 × 50 mm</span></span></div>
      </header>

      {!labelsUnlocked ? (
        <section className="mx-auto max-w-4xl rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 border-b border-black/[0.07] pb-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Workstation printer setup</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Connect before printing</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">The list below comes from this workstation, not the server. Choose its printer, send a 30 × 50 mm test, and confirm that a label physically came out.</p></div><span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#f1f7f7] px-3 py-2 text-xs font-semibold text-[#28637d]"><Laptop size={14} />{printerStatus?.host || "Checking workstation…"}</span></div>
          <div className="grid gap-3 py-6 sm:grid-cols-3">{[["1", "Start connector", "Run the local printer connector on this workstation."], ["2", "Choose printer", "Select a printer connected to this workstation."], ["3", "Test and confirm", "Only then do the label controls unlock."]].map(([number, title, detail]) => <div key={number} className="rounded-2xl border border-black/[0.07] bg-[#fbfcfc] p-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#101820] text-xs font-bold text-white">{number}</span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-black/50">{detail}</p></div>)}</div>

          {setupError && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-2"><CircleAlert className="mt-0.5 shrink-0" size={16} />{setupError}</span>{setupState === "error" && <button type="button" onClick={() => void refreshPrinterStatus()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs text-red-900 shadow-sm"><RefreshCw size={14} />Retry connection</button>}</div>}
          {setupState === "checking" ? <div className="rounded-2xl border border-dashed border-black/15 px-5 py-10 text-center text-sm text-black/50">Checking this workstation&apos;s local printer connector…</div> : setupState === "error" ? null : <>
            <div className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Available printers on {printerStatus?.host}</h3><p className="mt-1 text-xs text-black/50">These printers belong to the workstation using this page.</p></div><button type="button" onClick={() => void refreshPrinterStatus()} disabled={setupState === "testing"} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[#28637d] hover:bg-[#f1f7f7] disabled:opacity-50"><RefreshCw size={14} />Refresh</button></div>
              {printerStatus?.printers.length ? <div className="grid gap-3 sm:grid-cols-2">{printerStatus.printers.map((printer) => { const selected = printer.name === selectedPrinter; return <button key={printer.name} type="button" onClick={() => choosePrinter(printer.name)} disabled={!printer.connected || setupState === "testing"} aria-pressed={selected} className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] ${selected ? "border-[#28637d] bg-[#f1f7f7]" : "border-black/[0.07] bg-white hover:border-[#28637d]/50"} ${!printer.connected ? "cursor-not-allowed opacity-50" : ""}`}><span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f5f5] text-[#28637d]"><Cable size={17} /></span><span className="min-w-0"><strong className="block break-all text-sm">{printer.name}</strong><span className="mt-1 block break-all text-xs text-black/45">{printer.device || "No device URI"}</span></span></span>{selected && printer.connected && <CheckCircle2 className="shrink-0 text-[#28637d]" size={18} />}</span><span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${printer.connected ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/50"}`}>{printer.connected ? `${printer.state} · connected` : "Not available"}</span></button>; })}</div> : <div className="rounded-2xl border border-dashed border-black/15 px-5 py-8 text-center text-sm text-black/50">No CUPS printers were found on this host.</div>}
            </div>
            {setupState === "confirm" ? <div className="mt-6 rounded-2xl bg-emerald-50 p-5"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 size={18} />Test sent to {selectedPrinter}</p><p className="mt-2 text-xs leading-5 text-emerald-900/75">Job {testJob}. Check the printer now. Continue only if the 30 × 50 mm test label physically printed and its border looks correct.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={confirmPrinter} className="admin-button h-12 flex-1">I see the test label — continue</button><button type="button" onClick={() => void testPrinter()} className="admin-button admin-button-secondary h-12 flex-1">Print test again</button></div></div> : <button type="button" onClick={() => void testPrinter()} disabled={!selectedPrinterDetails?.connected || setupState === "testing" || connectedPrinters.length === 0} className="admin-button mt-6 h-12 w-full disabled:opacity-50"><Printer size={18} />{setupState === "testing" ? "Sending connection test…" : "Connect printer and print test"}</button>}
            <p className="mt-4 text-center text-xs leading-5 text-black/45">Labels stay locked until you confirm the physical output. This protects against a local connector or printer that accepts jobs while the printer is offline.</p>
          </>}
        </section>
      ) : (
        <section className="rounded-3xl border border-black/[0.07] bg-white p-4 shadow-sm sm:p-6"><div className="space-y-4"><div className="flex flex-col gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><CheckCircle2 size={16} />{selectedPrinter} is verified for this session.</span><button type="button" onClick={() => { setLabelsUnlocked(false); setSetupState("choose"); }} className="text-left underline underline-offset-2">Change printer</button></div><p className="text-xs leading-5 text-[var(--color-ink-soft)]">Tick the versions to sticker and set copies. Each sticker carries the price, a QR to the product page, and the SKU. The native printer receives exact 30 × 50 mm TSPL labels.</p>{error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-900">{error}</p>}{notice && <div role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 sm:flex-row sm:items-center sm:justify-between"><span>{notice}</span></div>}
          {unavailable ? <p className="text-xs text-[var(--color-ink-soft)]">The product list could not be loaded. Reload the page and try again.</p> : products === null ? <p className="text-xs text-[var(--color-ink-soft)]">Loading products…</p> : <><input type="search" className="admin-input" placeholder="Search products or SKUs…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products or SKUs" /><div className="max-h-[42rem] space-y-3 overflow-y-auto pr-1">{visible.map((product) => <fieldset key={product.id} className="rounded-2xl border border-[var(--color-line)] p-3"><legend className="px-1 text-sm font-semibold">{product.name}</legend>{product.variants.map((variant) => { const entry = selection[variant.id] || { checked: false, copies: 1 }; return <div key={variant.id} className="grid grid-cols-[auto_minmax(0,1fr)_5rem] items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-[#f6f8f9]"><input type="checkbox" id={`label-${variant.id}`} className="h-5 w-5 accent-[var(--color-brand-deep)]" checked={entry.checked} onChange={() => toggleVariant(variant.id)} /><label htmlFor={`label-${variant.id}`} className="min-w-0 cursor-pointer leading-5"><span className="block break-words font-semibold">{variant.title}</span><span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-black/50"><span className="font-mono">{variant.sku}</span><span>{formatCedis(variant.price)}</span></span></label><input type="number" min={1} max={50} aria-label={`Copies of ${variant.sku}`} className="admin-input w-full px-2 py-2 text-center" value={entry.copies} onChange={(event) => setCopies(variant.id, Number(event.target.value))} /></div>; })}</fieldset>)}{visible.length === 0 && <p className="text-xs text-[var(--color-ink-soft)]">No products match that search.</p>}</div></>}
          <button type="button" onClick={() => void printLabels()} disabled={busy || stickerCount === 0 || products === null} className="admin-button h-12 w-full disabled:opacity-50"><Printer size={18} />{busy ? "Sending labels…" : `Print ${stickerCount} label${stickerCount === 1 ? "" : "s"}`}</button><p className="text-xs leading-5 text-[var(--color-ink-soft)]">The test page was verified before this workspace unlocked. If the printer is moved or reloaded, use Change printer and run the test again.</p>
        </div></section>
      )}
    </div>
  );
}
