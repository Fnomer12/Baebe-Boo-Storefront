"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Cable, CheckCircle2, ChevronUp, CircleAlert, Laptop, Minus, Package, Plus, Printer, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { formatCedis } from "@/domain/money";
import { getLocalPrinterStatus, sendLocalPrintJob, type LocalPrinterStatus } from "@/lib/labels/local-printer";
import DirectUsbSetup from "@/components/printer/DirectUsbSetup";
import DriverDownloadCard from "@/components/printer/DriverDownloadCard";
import TillSetupHelp from "@/components/printer/TillSetupHelp";
import { deviceLabel, sendBase64UsbJob, type UsbPrinterDevice } from "@/lib/labels/webusb-print";

type LabelVariant = { id: string; sku: string; title: string; price: number };
type LabelProduct = { id: string; name: string; imageUrl: string; variants: LabelVariant[] };
type SelectedLabel = { product: LabelProduct; variant: LabelVariant; copies: number };
type Selection = Record<string, { checked: boolean; copies: number }>;
type SetupState = "checking" | "choose" | "testing" | "confirm" | "ready" | "error";

/** Connect the workstation printer, verify a physical test label, then print 50×30mm labels. */
export default function LabelPrintWorkspace() {
  const [products, setProducts] = useState<LabelProduct[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<LocalPrinterStatus | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [usbDevice, setUsbDevice] = useState<UsbPrinterDevice | null>(null);
  const [transport, setTransport] = useState<"bridge" | "usb">("bridge");
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [setupError, setSetupError] = useState("");
  const [testJob, setTestJob] = useState("");
  const [labelsUnlocked, setLabelsUnlocked] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>({});
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
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
      if (transport === "bridge" || !usbDevice) setSelectedPrinter(preferred?.name || "");
      setSetupState("choose");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "The local printer connector is unavailable.");
      setSetupState("error");
    }
  }, [transport, usbDevice]);

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
          products?: Array<{ id?: unknown; name?: unknown; imageUrl?: unknown; variants?: Array<{ id?: unknown; sku?: unknown; title?: unknown; price?: unknown }> }>;
        };
        if (!response.ok) throw new Error("unavailable");
        if (cancelled) return;
        setProducts((payload.products || []).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? "Product"),
          imageUrl: String(row.imageUrl ?? ""),
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
      if (transport === "usb" && usbDevice) {
        const jobId = await sendBase64UsbJob(usbDevice, result.jobBase64);
        setNotice(`${result.count || "Label"} label${result.count === 1 ? "" : "s"} sent via Direct USB (${jobId}).`);
      } else {
        const printed = await sendLocalPrintJob({ printer: selectedPrinter, title: result.title || "Baebe Boo shelf labels", jobBase64: result.jobBase64 });
        setNotice(`${result.count || "Label"} label${result.count === 1 ? "" : "s"} sent to ${printed.printer} (${printed.jobId}).`);
      }
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
    setSelectedPrinter(name); setUsbDevice(null); setTransport("bridge"); setLabelsUnlocked(false); setSetupState("choose"); setSetupError(""); setTestJob(""); setError(""); setNotice("");
  }

  const getUsbTestJob = useCallback(async () => {
    const response = await fetch("/api/admin/printer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test-job" }),
    });
    const result = (await response.json().catch(() => ({}))) as { message?: string; title?: string; jobBase64?: string };
    if (!response.ok) throw new Error(result.message || "The test page could not be sent.");
    if (!result.jobBase64) throw new Error("The server did not return a printer test job.");
    return { title: result.title, jobBase64: result.jobBase64 };
  }, []);

  async function handleUsbVerified(device: UsbPrinterDevice, usbJobId: string) {
    setSetupState("testing"); setSetupError("");
    try {
      const printer = deviceLabel(device).slice(0, 128);
      const response = await fetch("/api/admin/printer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", printer, bridgeJobId: usbJobId }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "The printer verification could not be saved.");
      setSelectedPrinter(printer); setUsbDevice(device); setTransport("usb"); setTestJob(usbJobId);
      setLabelsUnlocked(true); setSetupState("ready"); setError(""); setNotice("");
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "The printer verification could not be saved.");
      setSetupState("choose");
    }
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
    return (products || []).filter((product) => product.name.toLowerCase().includes(normalized) || product.variants.some((variant) => variant.sku.toLowerCase().includes(normalized) || variant.title.toLowerCase().includes(normalized)));
  }, [products, query]);
  const selectedItems = useMemo<SelectedLabel[]>(() => (products || []).flatMap((product) => product.variants.flatMap((variant) => {
    const entry = selection[variant.id];
    return entry?.checked ? [{ product, variant, copies: Math.max(1, entry.copies) }] : [];
  })), [products, selection]);
  const stickerCount = selectedItems.reduce((sum, item) => sum + item.copies, 0);
  const selectedVariantCount = selectedItems.length;
  const selectedProductCount = new Set(selectedItems.map((item) => item.product.id)).size;
  const selectedPrinterDetails = printerStatus?.printers.find((printer) => printer.name === selectedPrinter);
  const connectedPrinters = printerStatus?.printers.filter((printer) => printer.connected) || [];

  function toggleVariant(id: string) {
    setSelection((current) => { const entry = current[id] || { checked: false, copies: 1 }; return { ...current, [id]: { ...entry, checked: !entry.checked } }; });
  }

  function setCopies(id: string, copies: number) {
    const safe = Number.isFinite(copies) ? Math.min(50, Math.max(1, Math.floor(copies))) : 1;
    setSelection((current) => ({ ...current, [id]: { checked: true, copies: safe } }));
  }

  function selectedVariantsFor(product: LabelProduct) {
    return product.variants.filter((variant) => selection[variant.id]?.checked);
  }

  function toggleProductVariants(product: LabelProduct, checked: boolean) {
    setSelection((current) => {
      const next = { ...current };
      for (const variant of product.variants) {
        const entry = current[variant.id] || { checked: false, copies: 1 };
        next[variant.id] = { ...entry, checked };
      }
      return next;
    });
  }

  function toggleProductExpanded(productId: string) {
    setExpandedProductId((current) => current === productId ? null : productId);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-8">
      <header className="flex flex-col gap-5 border-b border-black/[0.07] pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/BaebeAdmin/products" className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-semibold text-[#28637d] hover:text-[#101820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2"><ArrowLeft size={16} />Back to products</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Catalog operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Print shelf labels</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">Connect this workstation&apos;s printer, verify one physical test label, then print 50 × 30 mm labels.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-black/[0.07] bg-white px-4 py-3 text-sm shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f5f5] text-[#28637d]"><Printer size={17} /></span><span><strong className="block">{selectedPrinter || "No printer selected"}</strong><span className="text-xs text-black/45">{printerStatus?.host || "Workstation not detected"} · 50 × 30 mm</span></span></div>
      </header>

      {!labelsUnlocked ? (
        <section className="mx-auto max-w-4xl rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 border-b border-black/[0.07] pb-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Workstation printer setup</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Connect before printing</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">The list below comes from this workstation, not the server. Choose its printer, send a 50 × 30 mm test, and confirm that a label physically came out.</p></div><span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#f1f7f7] px-3 py-2 text-xs font-semibold text-[#28637d]"><Laptop size={14} />{printerStatus?.host || "Checking workstation…"}</span></div>
          <div className="grid gap-3 py-6 sm:grid-cols-3">{[["1", "Get set up", "Download the till setup below and run it once on this till."], ["2", "Pick the printer", "Choose this till's printer from the list."], ["3", "Print a test", "Confirm a real label came out. Only then do labels unlock."]].map(([number, title, detail]) => <div key={number} className="rounded-2xl border border-black/[0.07] bg-[#fbfcfc] p-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#101820] text-xs font-bold text-white">{number}</span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-black/50">{detail}</p></div>)}</div>

          <DirectUsbSetup getTestJob={getUsbTestJob} onVerified={(device, usbJobId) => void handleUsbVerified(device, usbJobId)} />

          <h3 className="mt-6 text-sm font-semibold">Or use the connector app</h3>
          <DriverDownloadCard />

          {setupError && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-2"><CircleAlert className="mt-0.5 shrink-0" size={16} />{setupError}</span>{setupState === "error" && <button type="button" onClick={() => void refreshPrinterStatus()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs text-red-900 shadow-sm"><RefreshCw size={14} />Retry connection</button>}</div>}
          {setupState === "error" && <TillSetupHelp onRetry={() => void refreshPrinterStatus()} />}
          {setupState === "checking" ? <div className="rounded-2xl border border-dashed border-black/15 px-5 py-10 text-center text-sm text-black/50">Checking this workstation&apos;s local printer connector…</div> : setupState === "error" ? null : <>
            <div className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Available printers on {printerStatus?.host}</h3><p className="mt-1 text-xs text-black/50">These printers belong to the workstation using this page.</p></div><button type="button" onClick={() => void refreshPrinterStatus()} disabled={setupState === "testing"} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[#28637d] hover:bg-[#f1f7f7] disabled:opacity-50"><RefreshCw size={14} />Refresh</button></div>
              {printerStatus?.printers.length ? <div className="grid gap-3 sm:grid-cols-2">{printerStatus.printers.map((printer) => { const selected = printer.name === selectedPrinter; return <button key={printer.name} type="button" onClick={() => choosePrinter(printer.name)} disabled={!printer.connected || setupState === "testing"} aria-pressed={selected} className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] ${selected ? "border-[#28637d] bg-[#f1f7f7]" : "border-black/[0.07] bg-white hover:border-[#28637d]/50"} ${!printer.connected ? "cursor-not-allowed opacity-50" : ""}`}><span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f5f5] text-[#28637d]"><Cable size={17} /></span><span className="min-w-0"><strong className="block break-all text-sm">{printer.name}</strong><span className="mt-1 block break-all text-xs text-black/45">{printer.device || "No device URI"}</span></span></span>{selected && printer.connected && <CheckCircle2 className="shrink-0 text-[#28637d]" size={18} />}</span><span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${printer.connected ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/50"}`}>{printer.connected ? `${printer.state} · connected` : "Not available"}</span></button>; })}</div> : <div className="rounded-2xl border border-dashed border-black/15 px-5 py-8 text-center text-sm text-black/50">No CUPS printers were found on this host.</div>}
            </div>
            {setupState === "confirm" ? <div className="mt-6 rounded-2xl bg-emerald-50 p-5"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 size={18} />Test sent to {selectedPrinter}</p><p className="mt-2 text-xs leading-5 text-emerald-900/75">Job {testJob}. Check the printer now. Continue only if the 50 × 30 mm test label physically printed and its border looks correct.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={confirmPrinter} className="admin-button h-12 flex-1">I see the test label — continue</button><button type="button" onClick={() => void testPrinter()} className="admin-button admin-button-secondary h-12 flex-1">Print test again</button></div></div> : <button type="button" onClick={() => void testPrinter()} disabled={!selectedPrinterDetails?.connected || setupState === "testing" || connectedPrinters.length === 0} className="admin-button mt-6 h-12 w-full disabled:opacity-50"><Printer size={18} />{setupState === "testing" ? "Sending connection test…" : "Connect printer and print test"}</button>}
            <p className="mt-4 text-center text-xs leading-5 text-black/45">Labels stay locked until you confirm the physical output. This protects against a local connector or printer that accepts jobs while the printer is offline.</p>
          </>}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><CheckCircle2 size={16} />{selectedPrinter} is verified for this session{transport === "usb" ? " via Direct USB" : ""}.</span><button type="button" onClick={() => { setLabelsUnlocked(false); setUsbDevice(null); setTransport("bridge"); setSetupState("choose"); }} className="text-left underline underline-offset-2">Change printer</button></div>
          {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-900">{error}</p>}
          {notice && <div role="status" className="flex flex-col gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 sm:flex-row sm:items-center sm:justify-between"><span>{notice}</span></div>}
          {unavailable ? <p className="rounded-3xl border border-dashed border-black/15 bg-white px-5 py-10 text-center text-xs text-[var(--color-ink-soft)]">The product list could not be loaded. Reload the page and try again.</p> : products === null ? <p className="rounded-3xl border border-dashed border-black/15 bg-white px-5 py-10 text-center text-xs text-[var(--color-ink-soft)]">Loading products…</p> : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="rounded-3xl border border-black/[0.07] bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 border-b border-black/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Product selector</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose products to print</h2><p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">Select a product to see its variants, prices, and copies.</p></div><div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold text-[var(--color-ink-soft)]"><span className="rounded-full bg-[var(--color-cream)] px-3 py-2">{visible.length} product{visible.length === 1 ? "" : "s"}</span><span className="rounded-full bg-[var(--color-cream)] px-3 py-2">{visible.reduce((sum, product) => sum + product.variants.length, 0)} variants</span></div></div>
              <label className="relative mt-5 block"><Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/40" /><span className="sr-only">Search products or SKUs</span><input type="search" className="admin-input pl-11" placeholder="Search products or SKUs…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search products or SKUs" /></label>
              <div className="mt-5 grid max-h-[48rem] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">{visible.map((product) => { const selectedVariants = selectedVariantsFor(product); const selectedCount = selectedVariants.length; const labelCount = selectedVariants.reduce((sum, variant) => sum + Math.max(1, selection[variant.id]?.copies || 1), 0); const expanded = expandedProductId === product.id; const allSelected = selectedCount === product.variants.length && product.variants.length > 0; const partiallySelected = selectedCount > 0 && !allSelected; return <article key={product.id} className={expanded ? "overflow-hidden rounded-2xl border border-[#b0617a] bg-white shadow-md sm:col-span-2 xl:col-span-3" : "overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white transition hover:-translate-y-0.5 hover:shadow-md"}>
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-brand-tint)]">{product.imageUrl && !failedImages[product.id] ? <>
                  {/* Product images are stored as arbitrary catalog URLs; next/image remote-host configuration is intentionally not required here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" onError={() => setFailedImages((current) => ({ ...current, [product.id]: true }))} />
                </> : <div className="grid h-full place-items-center text-[#b0617a]"><Package size={42} strokeWidth={1.5} /><span className="sr-only">No product image</span></div>}<span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-ink-soft)] shadow-sm">{product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</span>{labelCount > 0 && <span className="absolute right-3 top-3 rounded-full bg-[#1c1518]/90 px-2.5 py-1.5 text-[11px] font-semibold text-white">{labelCount} label{labelCount === 1 ? "" : "s"}</span>}</div>
                <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-semibold leading-5">{product.name}</h3><p className="mt-1 text-xs text-[var(--color-ink-soft)]">{selectedCount ? `${selectedCount} of ${product.variants.length} variants selected` : "No variants selected"}</p></div>{selectedCount > 0 && <CheckCircle2 className="shrink-0 text-[#b0617a]" size={19} aria-label="Product has selected variants" />}</div><button type="button" onClick={() => toggleProductExpanded(product.id)} aria-expanded={expanded} aria-controls={`variants-${product.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-3 text-xs font-semibold transition hover:bg-[var(--color-brand-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d]">{expanded ? <><ChevronUp size={16} />Hide variants</> : <><SlidersHorizontal size={16} />Choose variants</>}</button></div>
                {expanded && <div id={`variants-${product.id}`} className="border-t border-[var(--color-line)] bg-[var(--color-cream)]/45 p-4 sm:p-5"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" aria-label={`Select all ${product.name} variants`} className="h-5 w-5 accent-[var(--color-brand-deep)]" checked={allSelected} ref={(element) => { if (element) element.indeterminate = partiallySelected; }} onChange={(event) => toggleProductVariants(product, event.target.checked)} /><span>Select all variants</span></label><span className="text-xs text-[var(--color-ink-soft)]">{selectedCount} of {product.variants.length} selected</span></div><div className="divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">{product.variants.map((variant) => { const entry = selection[variant.id] || { checked: false, copies: 1 }; return <div key={variant.id} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 text-sm transition hover:bg-[var(--color-cream)] sm:grid-cols-[auto_minmax(0,1fr)_8.5rem] ${entry.checked ? "bg-[#fdf7f9]" : ""}`}><input type="checkbox" id={`label-${variant.id}`} className="mt-1 h-5 w-5 accent-[var(--color-brand-deep)]" checked={entry.checked} onChange={() => toggleVariant(variant.id)} /><label htmlFor={`label-${variant.id}`} className="min-w-0 cursor-pointer leading-5"><span className="block break-words font-semibold">{variant.title}</span><span className="mt-1 flex flex-wrap gap-x-2 text-xs text-black/50"><span className="font-mono">{variant.sku}</span><span className="font-semibold text-[var(--color-ink)]">{formatCedis(variant.price)}</span></span>{entry.checked && <span className="mt-2 hidden text-[11px] font-semibold text-[#b0617a] sm:block">Selected for printing</span>}</label><div className="col-start-2 flex min-h-11 items-center justify-between gap-2 sm:col-start-auto sm:justify-end"><span className="text-xs font-semibold text-[var(--color-ink-soft)] sm:hidden">Copies</span><div className="flex h-11 items-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-white"><button type="button" className="grid h-full w-10 place-items-center text-[var(--color-ink-soft)] transition hover:bg-[var(--color-brand-tint)] focus-visible:bg-[var(--color-brand-tint)]" aria-label={`Decrease copies of ${variant.title}`} onClick={() => setCopies(variant.id, entry.copies - 1)}><Minus size={14} /></button><input type="number" min={1} max={50} aria-label={`Copies of ${variant.sku}`} className="h-full w-10 border-x border-[var(--color-line)] text-center text-sm font-semibold" value={entry.copies} onChange={(event) => setCopies(variant.id, Number(event.target.value))} /><button type="button" className="grid h-full w-10 place-items-center text-[var(--color-ink-soft)] transition hover:bg-[var(--color-brand-tint)] focus-visible:bg-[var(--color-brand-tint)]" aria-label={`Increase copies of ${variant.title}`} onClick={() => setCopies(variant.id, entry.copies + 1)}><Plus size={14} /></button></div></div></div>; })}</div></div>}
              </article>; })}{visible.length === 0 && <p className="rounded-2xl border border-dashed border-black/15 px-5 py-8 text-center text-xs text-[var(--color-ink-soft)] sm:col-span-2 xl:col-span-3">No products match that search.</p>}</div>
            </section>
            <aside className="lg:sticky lg:top-7"><div className="rounded-3xl border border-[var(--color-line)] bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Print summary</p><div className="mt-3 grid grid-cols-2 gap-3 border-b border-[var(--color-line)] pb-4"><div><strong className="block text-3xl font-semibold tracking-tight">{stickerCount}</strong><span className="text-xs text-[var(--color-ink-soft)]">total labels</span></div><div><strong className="block text-3xl font-semibold tracking-tight">{selectedVariantCount}</strong><span className="text-xs text-[var(--color-ink-soft)]">variants</span></div></div><p className="mt-3 text-xs font-semibold text-[var(--color-ink-soft)]">{selectedProductCount} product{selectedProductCount === 1 ? "" : "s"} selected</p><div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">{selectedItems.length ? selectedItems.map(({ product, variant, copies }) => <div key={variant.id} className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0"><strong className="block break-words text-[var(--color-ink)]">{product.name}</strong><span className="mt-0.5 block break-words text-[var(--color-ink-soft)]">{variant.title}</span><span className="mt-0.5 block font-mono text-[var(--color-ink-soft)]">{variant.sku}</span></span><span className="shrink-0 font-semibold text-[var(--color-ink)]">× {copies}</span></div>) : <p className="text-xs leading-5 text-[var(--color-ink-soft)]">Choose a product and select its variants to build this print job.</p>}</div><button type="button" onClick={() => void printLabels()} disabled={busy || stickerCount === 0} className="admin-button mt-5 h-12 w-full disabled:opacity-50"><Printer size={18} />{busy ? "Sending labels…" : `Print ${stickerCount} label${stickerCount === 1 ? "" : "s"}`}</button><p className="mt-4 text-xs leading-5 text-[var(--color-ink-soft)]">Each sticker carries the price, a QR to the product page, and the SKU. Long product names wrap and shorten safely so the price and scan codes remain clear.</p></div></aside>
          </div>}
        </section>
      )}
    </div>
  );
}
