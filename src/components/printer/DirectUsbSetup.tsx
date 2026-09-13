"use client";

import { useEffect, useState } from "react";
import { Cable, CheckCircle2, CircleAlert, RefreshCw, Usb } from "lucide-react";
import {
  deviceLabel,
  getUsbEnvironment,
  isWebUsbSupported,
  requestUsbPrinter,
  sendBase64UsbJob,
  toFriendlyUsbError,
  UsbError,
  type UsbFailureKind,
  type UsbPrinterDevice,
} from "@/lib/labels/webusb-print";

/**
 * Zero-install USB setup: Chrome/Edge talks to the thermal printer directly.
 * The parent supplies how to fetch a test job (admin vs counter endpoints
 * differ) and receives the verified device name + job id for the same
 * server-side verify-cookie flow the bridge uses.
 */
export default function DirectUsbSetup({
  getTestJob,
  onVerified,
}: {
  getTestJob: () => Promise<{ title?: string; jobBase64: string }>;
  onVerified: (device: UsbPrinterDevice, jobId: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Read browser capabilities only after mount: server and first client render
  // must agree (otherwise React hydration error #418 on every load).
  const supported = mounted && isWebUsbSupported();
  const env = mounted
    ? getUsbEnvironment()
    : { supported: false, secureContext: true, origin: "" };
  const [device, setDevice] = useState<UsbPrinterDevice | null>(null);
  const [state, setState] = useState<"idle" | "connecting" | "ready" | "testing" | "confirm" | "error">("idle");
  const [message, setMessage] = useState("");
  const [failureKind, setFailureKind] = useState<UsbFailureKind | null>(null);
  const [jobId, setJobId] = useState("");

  function report(error: unknown, fallback: string): UsbFailureKind | null {
    const friendly = error instanceof UsbError ? error : toFriendlyUsbError(error);
    setMessage(error instanceof Error ? error.message : friendly.message || fallback);
    setFailureKind(friendly.kind);
    return friendly.kind;
  }

  if (!supported) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-black/15 px-3 py-3 text-center text-xs leading-5 text-black/50">
        Direct USB needs Chrome or Edge on HTTPS (or localhost). This browser can still use the connector app or a PDF.
      </p>
    );
  }

  async function connect() {
    setState("connecting");
    setMessage("");
    setFailureKind(null);
    try {
      const next = await requestUsbPrinter();
      setDevice(next);
      setState("ready");
    } catch (error) {
      report(error, "The USB printer could not be connected.");
      setState(device ? "ready" : "error");
    }
  }

  async function test() {
    if (!device) {
      setMessage("Connect the USB printer first.");
      return;
    }
    setState("testing");
    setMessage("");
    setFailureKind(null);
    try {
      const job = await getTestJob();
      if (!job.jobBase64) throw new Error("The server did not return a printer test job.");
      const id = await sendBase64UsbJob(device, job.jobBase64);
      setJobId(id);
      setState("confirm");
    } catch (error) {
      report(error, "The USB test could not be sent.");
      setState("ready");
    }
  }

  const showBridgeHint = failureKind === "claimed" || failureKind === "blocked" || failureKind === "insecure-context";

  return (
    <div className="mt-3 rounded-2xl border border-black/[0.07] bg-[#fbfcfc] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Usb size={16} /> Direct USB — no app to install
      </p>
      <p className="mt-1 text-xs leading-5 text-black/50">
        Chrome talks to the label printer over USB and sends the same raw TSPL bytes as the connector app.
      </p>

      {env.secureContext === false && (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          This page is not a secure context ({env.origin || "unknown origin"}), so Chrome hides USB access entirely. Open the
          site over HTTPS — or http://localhost on the till itself — and Direct USB will appear.
        </p>
      )}

      {message && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
          <CircleAlert size={14} className="mt-0.5 shrink-0" /> {message}
        </p>
      )}
      {showBridgeHint && (
        <p className="mt-2 rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-[11px] leading-5 text-black/60">
          This till needs the one-time printer setup below before Direct USB can take the printer. It takes a few
          minutes and you only do it once.
        </p>
      )}

      {!device ? (
        <button
          type="button"
          onClick={() => void connect()}
          disabled={state === "connecting"}
          className="admin-button mt-3 min-h-11 w-full text-xs disabled:opacity-50"
        >
          <Cable size={15} /> {state === "connecting" ? "Waiting for USB permission…" : "Connect USB printer"}
        </button>
      ) : state === "confirm" ? (
        <div className="mt-3 rounded-xl bg-emerald-50 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
            <CheckCircle2 size={15} /> Test sent · {jobId}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-emerald-900/75">
            Check the printer now. Continue only if the test physically printed.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => device && onVerified(device, jobId)}
              className="admin-button min-h-10 flex-1 text-xs"
            >
              I see it — continue
            </button>
            <button type="button" onClick={() => void test()} className="admin-button admin-button-secondary min-h-10 flex-1 text-xs">
              Test again
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-2 break-all text-xs font-semibold">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-700" /> {deviceLabel(device)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void test()}
              disabled={state === "testing"}
              className="admin-button min-h-10 flex-1 text-xs disabled:opacity-50"
            >
              {state === "testing" ? "Sending test…" : "Print test page"}
            </button>
            <button
              type="button"
              onClick={() => void connect()}
              disabled={state === "testing"}
              className="admin-button admin-button-secondary min-h-10 flex-1 text-xs disabled:opacity-50"
            >
              <RefreshCw size={13} /> Change device
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
