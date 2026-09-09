"use client";

import { useCallback, useEffect, useState } from "react";
import { Cable, CheckCircle2, CircleAlert, Printer, RefreshCw, Server } from "lucide-react";

type Printer = {
  name: string;
  state: string;
  device: string | null;
  enabled: boolean;
  connected: boolean;
};

type PrinterStatus = {
  host: string;
  configuredPrinter: string;
  printers: Printer[];
};

export default function CounterPrinterSetup({
  open,
  onVerified,
}: {
  open: boolean;
  onVerified: () => void;
}) {
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"checking" | "choose" | "testing" | "confirm" | "error">("checking");
  const [message, setMessage] = useState("");
  const [jobId, setJobId] = useState("");

  const load = useCallback(async () => {
    setState("checking");
    setMessage("");
    try {
      const response = await fetch("/api/counter/printer", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as PrinterStatus & { message?: string };
      if (!response.ok) throw new Error(payload.message || "The host printer service is unavailable.");
      setStatus(payload);
      const preferred = payload.printers.find((printer) => printer.name === payload.configuredPrinter && printer.connected)
        || payload.printers.find((printer) => printer.connected);
      setSelected(preferred?.name || "");
      setState("choose");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The host printer service is unavailable.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, open]);

  async function test() {
    if (!selected) {
      setMessage("Choose the connected printer first.");
      return;
    }
    setState("testing");
    setMessage("");
    try {
      const response = await fetch("/api/counter/printer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", printer: selected }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; jobId?: string };
      if (!response.ok) throw new Error(payload.message || "The printer test could not be sent.");
      setJobId(payload.jobId || "Job submitted");
      setState("confirm");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The printer test could not be sent.");
      setState("choose");
    }
  }

  if (!open) return null;

  return (
    <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-brand-deep)]">Printer setup</p>
          <h3 className="mt-1 text-lg font-semibold">Connect before printing</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--color-ink-soft)]">Choose the printer connected to this host, print an 80 mm receipt test page, then confirm it came out.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-brand-tint)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-brand-deep)]"><Server size={13} />{status?.host || "Checking host…"}</span>
      </div>

      {state === "checking" ? <p className="mt-4 rounded-xl border border-dashed border-[var(--color-line)] px-3 py-5 text-center text-xs text-[var(--color-ink-soft)]">Checking the host printer service…</p> : state === "error" ? <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"><span className="flex items-center gap-2"><CircleAlert size={15} />{message}</span><button type="button" onClick={() => void load()} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-2"><RefreshCw size={13} />Retry</button></div> : <>
        <div className="mt-4 space-y-2">
          {status?.printers.map((printer) => {
            const active = printer.name === selected;
            return <button key={printer.name} type="button" onClick={() => setSelected(printer.name)} disabled={!printer.connected || state === "testing"} aria-pressed={active} className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left ${active ? "border-[var(--color-brand-deep)] bg-[var(--color-brand-tint)]" : "border-[var(--color-line)]"} ${!printer.connected ? "cursor-not-allowed opacity-50" : ""}`}><span className="flex min-w-0 items-start gap-2"><Cable size={16} className="mt-0.5 shrink-0 text-[var(--color-brand-deep)]" /><span className="min-w-0"><strong className="block break-all text-xs">{printer.name}</strong><span className="mt-1 block break-all text-[11px] text-[var(--color-ink-soft)]">{printer.device || "No device URI"}</span></span></span>{active && printer.connected && <CheckCircle2 size={16} className="shrink-0 text-[var(--color-brand-deep)]" />}</button>;
          })}
        </div>
        {state === "confirm" ? <div className="mt-4 rounded-xl bg-emerald-50 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-emerald-900"><CheckCircle2 size={15} />Receipt test sent · {jobId}</p><p className="mt-1 text-[11px] leading-5 text-emerald-900/75">Check the counter printer. Continue only if the 80 mm receipt test page physically printed.</p><div className="mt-3 flex gap-2"><button type="button" onClick={onVerified} className="admin-button min-h-10 flex-1 text-xs">I see it — continue</button><button type="button" onClick={() => void test()} className="admin-button admin-button-secondary min-h-10 flex-1 text-xs">Test again</button></div></div> : <button type="button" onClick={() => void test()} disabled={!selected || state === "testing"} className="admin-button mt-4 min-h-11 w-full disabled:opacity-50"><Printer size={16} />{state === "testing" ? "Sending test…" : "Print receipt test page"}</button>}
      </>}
    </section>
  );
}
