"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, PlugZap, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import DriverDownloadCard from "@/components/printer/DriverDownloadCard";
import WinUsbGuideCard from "@/components/printer/WinUsbGuideCard";
import {
  deviceLabel,
  getUsbEnvironment,
  isWebUsbSupported,
  listBulkOutRoutes,
  listGrantedUsbDevices,
  rawUsbErrorName,
  requestUsbPrinter,
  sendBase64UsbJob,
  toFriendlyUsbError,
  type UsbPrinterDevice,
} from "@/lib/labels/webusb-print";

/** Hardware spike page: proves WebUSB claiming works on the real till + printer. */
export default function UsbProbeWorkspace() {
  // Mount-gated browser reads: server and first client render must agree (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const supported = mounted && isWebUsbSupported();
  const env = mounted ? getUsbEnvironment() : { supported: false, secureContext: true, origin: "" };
  const userAgent = mounted && typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const [device, setDevice] = useState<UsbPrinterDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("");

  function append(line: string) {
    setLog((current) => `${current}${current ? "\n" : ""}${line}`);
  }

  function logError(context: string, error: unknown) {
    const friendly = toFriendlyUsbError(error);
    append(`${context} [${rawUsbErrorName(error)}]: ${friendly.message}`);
  }

  async function list() {
    setBusy(true);
    try {
      const devices = await listGrantedUsbDevices();
      if (devices.length === 0) {
        append("No paired USB devices. Click Connect first, then List again.");
      }
      for (const entry of devices) {
        append(`Paired: ${deviceLabel(entry)} opened=${entry.opened}`);
        const config = entry.configuration;
        if (config) {
          for (const iface of config.interfaces || []) {
            const endpoints = (iface.alternate?.endpoints || [])
              .map((endpoint) => `#${endpoint.endpointNumber}:${endpoint.direction}/${endpoint.packetSize}`)
              .join(" ");
            append(`  iface #${iface.interfaceNumber} class=${iface.alternate?.interfaceClass} endpoints: ${endpoints || "none"}`);
          }
        } else {
          append("  (no active configuration yet — connect + open to enumerate)");
        }
      }
    } catch (error) {
      logError("List failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const next = await requestUsbPrinter();
      setDevice(next);
      append(`Connected: ${deviceLabel(next)}`);
      append("Now click List paired devices to confirm the bulk OUT endpoint is visible.");
    } catch (error) {
      logError("Connect failed", error);
    } finally {
      setBusy(false);
    }
  }

  /** Staged diagnostic: open -> enumerate -> claim, logging the exact failing step. */
  async function diagnose() {
    if (!device) {
      append("Connect a device first.");
      return;
    }
    setBusy(true);
    try {
      append(`Step 1/4 open: opened=${device.opened}`);
      if (!device.opened) {
        await device.open();
        append("  open ok");
      } else {
        append("  already open, skipped");
      }
      const config = device.configuration;
      append(`Step 2/4 enumerate: ${config ? `config #${config.configurationValue}, ${config.interfaces?.length || 0} interface(s)` : "no active configuration"}`);
      for (const iface of config?.interfaces || []) {
        const endpoints = (iface.alternate?.endpoints || [])
          .map((endpoint) => `#${endpoint.endpointNumber}:${endpoint.direction}/${endpoint.packetSize}`)
          .join(" ");
        append(`  iface #${iface.interfaceNumber} class=${iface.alternate?.interfaceClass} endpoints: ${endpoints || "none"}`);
      }
      const routes = listBulkOutRoutes(device);
      if (routes.length === 0) {
        append("Step 3/4 claim: SKIPPED — no writable bulk OUT endpoint on this device.");
        return;
      }
      append(`Step 3/4 claim: trying ${routes.length} interface(s) in order`);
      let claimed = false;
      for (const route of routes) {
        append(`  iface #${route.interfaceNumber}, endpoint #${route.endpointNumber} ...`);
        try {
          await device.claimInterface(route.interfaceNumber);
          append(`  iface #${route.interfaceNumber}: CLAIM OK`);
          claimed = true;
          break;
        } catch (error) {
          append(`  iface #${route.interfaceNumber}: failed [${rawUsbErrorName(error)}]`);
        }
      }
      if (!claimed) {
        append("  every interface is held (usually the OS printer driver). This till needs the connector app.");
        return;
      }
      append("This till CAN use Direct USB. Step 4/4: send a calibration test.");
    } catch (error) {
      logError("Diagnose failed", error);
      append("  A claim/open failure here means the OS driver owns the interface: use the connector app on this till.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!device) {
      append("Connect a device first.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/printer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-job" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; jobBase64?: string };
      if (!response.ok) throw new Error(payload.message || "The test job could not be built.");
      if (!payload.jobBase64) throw new Error("The server did not return a test job.");
      const jobId = await sendBase64UsbJob(device, payload.jobBase64);
      append(`Test sent (${jobId}). Check the printer for a 50x30mm label.`);
    } catch (error) {
      logError("Test failed", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <header>
        <Link
          href="/BaebeAdmin/products/labels"
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl text-sm font-semibold text-[#28637d] hover:text-[#101820]"
        >
          <ArrowLeft size={16} /> Back to labels
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">Hardware spike</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">USB probe</h1>
        <p className="mt-2 text-sm leading-6 text-black/55">
          Run this on the real till in Chrome/Edge with the XP-365B plugged in. Support:{" "}
          <strong>{supported ? "WebUSB available" : "WebUSB NOT available in this browser"}</strong>
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-black/[0.07] bg-white p-4 text-xs sm:grid-cols-3">
          <div><dt className="font-semibold text-black/45">Secure context</dt><dd className="mt-0.5 font-semibold">{env.secureContext ? "yes" : "NO — use HTTPS/localhost"}</dd></div>
          <div><dt className="font-semibold text-black/45">Origin</dt><dd className="mt-0.5 break-all font-mono">{env.origin || "unknown"}</dd></div>
          <div><dt className="font-semibold text-black/45">User agent</dt><dd className="mt-0.5 break-all">{userAgent}</dd></div>
        </dl>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => void connect()} disabled={busy || !supported} className="admin-button h-11 flex-1 disabled:opacity-50">
          <PlugZap size={16} /> Connect USB device
        </button>
        <button
          type="button"
          onClick={() => void list()}
          disabled={busy || !supported}
          className="admin-button admin-button-secondary h-11 flex-1 disabled:opacity-50"
        >
          <RefreshCw size={15} /> List paired devices
        </button>
        <button type="button" onClick={() => void sendTest()} disabled={busy || !supported || !device} className="admin-button h-11 flex-1 disabled:opacity-50">
          <Printer size={16} /> Send calibration test
        </button>
        <button type="button" onClick={() => void diagnose()} disabled={busy || !supported || !device} className="admin-button admin-button-secondary h-11 flex-1 disabled:opacity-50">
          <PlugZap size={16} /> Diagnose claim
        </button>
      </div>

      {device && <p className="text-xs font-semibold text-emerald-800">Active: {deviceLabel(device)}</p>}

      <DriverDownloadCard />

      <WinUsbGuideCard visible />

      <pre className="min-h-48 overflow-auto whitespace-pre-wrap rounded-2xl border border-black/[0.07] bg-[#101820] p-4 font-mono text-xs leading-5 text-emerald-100">
        {log || "Log is empty. Connect the printer, then list devices."}
      </pre>

      <p className="text-xs leading-5 text-black/45">
        Windows note: if Connect succeeds but claiming fails, the OS print driver owns the interface — free it once with
        the Zadig WinUSB rebind above. The packaged bridge remains the fallback for tills where that is not allowed.
      </p>
    </div>
  );
}
