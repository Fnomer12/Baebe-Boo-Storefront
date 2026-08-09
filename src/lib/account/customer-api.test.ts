import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isTrustedMutationOrigin } from "./customer-api";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.jtechinnovations.tech";
});

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

function requestWith(headers: Record<string, string>) {
  // The URL deliberately mimics production, where Next builds request.url from
  // the --hostname/--port bind address, not from the Host header. The guard
  // must never look at it.
  return new Request("https://127.0.0.1:3011/api/account/referrals", {
    method: "POST",
    headers,
  });
}

describe("isTrustedMutationOrigin", () => {
  it("accepts the production shape: Origin matches the proxied Host, not request.url", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "https://baebe-boo.jtechinnovations.tech",
          host: "baebe-boo.jtechinnovations.tech",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a cross-site Origin", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "https://evil.example",
          host: "baebe-boo.jtechinnovations.tech",
        }),
      ),
    ).toBe(false);
  });

  it("rejects Origin: null (sandboxed iframe)", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "null",
          host: "baebe-boo.jtechinnovations.tech",
        }),
      ),
    ).toBe(false);
  });

  it("accepts when Origin matches NEXT_PUBLIC_SITE_URL even if proxy headers drifted", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "https://baebe-boo.jtechinnovations.tech",
          host: "internal-lb.local",
        }),
      ),
    ).toBe(true);
  });

  it("allows a missing Origin (non-browser client) when Sec-Fetch-Site is absent", () => {
    expect(isTrustedMutationOrigin(requestWith({ host: "anything.example" }))).toBe(true);
  });

  it("rejects a missing Origin when Sec-Fetch-Site says cross-site", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({ host: "baebe-boo.jtechinnovations.tech", "sec-fetch-site": "cross-site" }),
      ),
    ).toBe(false);
  });

  it("allows a missing Origin when Sec-Fetch-Site is same-origin", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({ host: "baebe-boo.jtechinnovations.tech", "sec-fetch-site": "same-origin" }),
      ),
    ).toBe(true);
  });

  it("prefers X-Forwarded-Host over Host", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "https://public.example",
          "x-forwarded-host": "public.example",
          host: "127.0.0.1:3011",
        }),
      ),
    ).toBe(true);
  });

  it("uses only the first X-Forwarded-Host value", () => {
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "https://second.example",
          "x-forwarded-host": "public.example, second.example",
          host: "127.0.0.1:3011",
        }),
      ),
    ).toBe(false);
  });

  it("keeps the port in the comparison for localhost dev", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://baebe-boo.jtechinnovations.tech";
    expect(
      isTrustedMutationOrigin(
        requestWith({ origin: "http://localhost:3020", host: "localhost:3020" }),
      ),
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        requestWith({ origin: "http://localhost:3020", host: "localhost:4000" }),
      ),
    ).toBe(false);
  });

  it("falls back to the canonical host when NEXT_PUBLIC_SITE_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(
      isTrustedMutationOrigin(
        requestWith({
          origin: "https://baebe-boo.jtechinnovations.tech",
          host: "internal-lb.local",
        }),
      ),
    ).toBe(true);
  });
});
