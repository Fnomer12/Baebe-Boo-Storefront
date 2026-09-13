import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

/**
 * Regression guard: the workstation printer bridge lives on loopback and the
 * browser refuses to reach it unless connect-src allowlists it. If this test
 * fails, label/receipt discovery and bridge printing silently break in
 * production (and on Vercel) with no other test going red.
 */
describe("next.config CSP", () => {
  it("allowlists the loopback printer bridge in connect-src", async () => {
    const headers = await nextConfig.headers!();
    const global = headers.find((entry) => entry.source === "/(.*)");
    expect(global).toBeDefined();
    const csp = global!.headers.find((header) => header.key === "Content-Security-Policy")!.value;
    const connectSrc = csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("connect-src"))!;
    expect(connectSrc).toContain("http://127.0.0.1:3210");
    expect(connectSrc).toContain("http://localhost:3210");
  });
});
