"use client";

export type LocalPrinter = {
  name: string;
  state: string;
  device: string | null;
  enabled: boolean;
  connected: boolean;
};

export type LocalPrinterStatus = {
  service: string;
  version: string;
  host: string;
  platform: string;
  printers: LocalPrinter[];
};

export type LocalPrintJob = {
  printer: string;
  title: string;
  jobBase64: string;
};

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:3210";

function bridgeUrl(): string {
  return (process.env.NEXT_PUBLIC_PRINTER_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/+$/, "");
}

async function bridgeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${bridgeUrl()}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "The local printer connector is not running on this workstation. Start it, then refresh the printer list.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "The local printer connector could not complete the request.");
  }
  return payload;
}

export function getLocalPrinterStatus(): Promise<LocalPrinterStatus> {
  return bridgeRequest<LocalPrinterStatus>("/v1/printers");
}

export function sendLocalPrintJob(job: LocalPrintJob): Promise<{ printed: true; printer: string; jobId: string }> {
  return bridgeRequest<{ printed: true; printer: string; jobId: string }>("/v1/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
}
