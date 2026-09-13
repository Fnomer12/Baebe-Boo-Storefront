"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ExternalLink } from "lucide-react";

type DriverEntry = {
  model: string;
  os: string;
  arch: string;
  osVersions: string[];
  vendorVersion: string;
  status: "pending-verification" | "verified";
  fileName: string | null;
  downloadUrl: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  vendorPage: string;
};

function looksLikeWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || "";
  return /win/i.test(`${ua} ${platform}`);
}

/**
 * Gives till staff the printer driver without hunting the vendor site.
 * Renders only on Windows; verified entries download our hosted copy,
 * pending entries link the official vendor page.
 */
export default function DriverDownloadCard() {
  // Mount-gated: server and first client render must agree (no hydration mismatch).
  const [windows, setWindows] = useState(false);
  useEffect(() => {
    setWindows(looksLikeWindows());
  }, []);
  const [drivers, setDrivers] = useState<DriverEntry[] | null>(null);

  useEffect(() => {
    if (!windows) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/printer-driver", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { drivers?: DriverEntry[] } | null;
        if (!cancelled && response.ok) setDrivers(payload?.drivers || []);
      } catch {
        if (!cancelled) setDrivers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windows]);

  if (!windows || drivers === null || drivers.length === 0) return null;
  const entry = drivers.find((candidate) => candidate.os === "windows") || drivers[0];

  return (
    <div className="mt-3 rounded-2xl border border-black/[0.07] bg-[#fbfcfc] p-4">
      <p className="text-sm font-semibold">No printer showing? Install the driver first</p>
      <p className="mt-1 text-xs leading-5 text-black/50">
        {entry.model} needs its Windows driver before any printing option can see it — not even Windows itself will list
        the printer without it.
      </p>
      {entry.status === "verified" && entry.downloadUrl ? (
        <div className="mt-3 space-y-2">
          <a href={entry.downloadUrl} className="admin-button min-h-11 w-full text-xs" download={entry.fileName || true}>
            <ArrowDownToLine size={15} /> Download {entry.model} driver (v{entry.vendorVersion})
          </a>
          <p className="text-[11px] leading-5 text-black/45">
            Official {entry.model} package v{entry.vendorVersion}, hosted by us. After installing, print a Windows test
            page, then refresh the printer list below.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <a href={entry.vendorPage} target="_blank" rel="noopener noreferrer" className="admin-button min-h-11 w-full text-xs">
            <ExternalLink size={15} /> Get the {entry.model} driver from XPrinter
          </a>
          <p className="text-[11px] leading-5 text-black/45">
            Opens the official XPrinter drivers page in a new tab — pick “Label printer (Windows)”. After installing,
            print a Windows test page, then refresh the printer list below.
          </p>
        </div>
      )}
    </div>
  );
}
