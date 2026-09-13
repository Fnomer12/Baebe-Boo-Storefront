import { NextResponse } from "next/server";
import manifest from "../../../../packages/printer-bridge/drivers.json";

type ManifestDriver = {
  model: string;
  os: string;
  arch: string;
  osVersions: string[];
  vendor: string;
  vendorVersion: string;
  status: "pending-verification" | "verified";
  fileName: string | null;
  downloadUrl: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  vendorPage: string;
};

/**
 * Public driver catalogue for the printer setup UI. Only verified entries
 * carry a download URL; pending entries expose the vendor page so staff can
 * still fetch the driver by hand.
 */
export async function GET() {
  const drivers = ((manifest as { drivers: ManifestDriver[] }).drivers || []).map((entry) => ({
    model: entry.model,
    os: entry.os,
    arch: entry.arch,
    osVersions: entry.osVersions,
    vendorVersion: entry.vendorVersion,
    status: entry.status,
    fileName: entry.status === "verified" ? entry.fileName : null,
    downloadUrl: entry.status === "verified" ? entry.downloadUrl : null,
    sha256: entry.status === "verified" ? entry.sha256 : null,
    sizeBytes: entry.status === "verified" ? entry.sizeBytes : null,
    vendorPage: entry.vendorPage,
  }));
  return NextResponse.json(
    {
      version: (manifest as { version: number }).version,
      updated: (manifest as { updated: string }).updated,
      drivers,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
