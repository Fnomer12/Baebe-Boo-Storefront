import { describe, expect, it } from "vitest";
import manifest from "../packages/printer-bridge/drivers.json";

type DriverEntry = {
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
  hardwareId: string;
  inf: string;
  driverName: string;
  silentArgs: string[];
  vendorPage: string;
  notes: string;
};

/**
 * The driver manifest is consumed by install-windows.ps1 (-InstallDriver) and
 * GET /api/printer-driver. Verified entries must be fully pinned so installs
 * fail closed on mismatch; pending entries must stay unpublished.
 */
describe("printer driver manifest", () => {
  const drivers = (manifest as { version: number; drivers: DriverEntry[] }).drivers;

  it("has at least one entry with the required shape", () => {
    expect(drivers.length).toBeGreaterThan(0);
    for (const entry of drivers) {
      expect(entry.model.length).toBeGreaterThan(0);
      expect(["windows", "macos", "linux"]).toContain(entry.os);
      expect(entry.arch.length).toBeGreaterThan(0);
      expect(entry.vendorVersion).toMatch(/^\d+\.\d+/);
      expect(["pending-verification", "verified"]).toContain(entry.status);
      expect(entry.vendorPage).toMatch(/^https:\/\//);
      expect(Array.isArray(entry.silentArgs)).toBe(true);
    }
  });

  it("keeps pending entries unpublished and verified entries fully pinned", () => {
    for (const entry of drivers) {
      if (entry.status === "pending-verification") {
        expect(entry.downloadUrl).toBeNull();
        expect(entry.sha256).toBeNull();
      } else {
        expect(entry.downloadUrl).toMatch(/^https:\/\//);
        expect(entry.fileName).toMatch(/\.(zip|exe)$/i);
        expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/i);
        expect(entry.sizeBytes).toBeGreaterThan(0);
      }
    }
  });

  it("covers the XP-365B on Windows x64", () => {
    const match = drivers.find(
      (entry) => /xp-365b/i.test(entry.model) && entry.os === "windows" && entry.arch === "x64",
    );
    expect(match).toBeDefined();
    expect(match!.hardwareId).toContain("XPRINTERXP-365B");
  });
});
