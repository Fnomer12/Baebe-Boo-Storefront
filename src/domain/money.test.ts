import { describe, expect, it } from "vitest";
import { formatCedis, formatCedisRange } from "./money";

describe("formatCedis", () => {
  it("always shows two decimal places", () => {
    // The bug this replaces: eight formatters disagreed, so 25 rendered as
    // "GH₵25" on the dashboard and "GH₵25.00" on the receipt for the same sale.
    expect(formatCedis(25)).toBe("GH₵25.00");
    expect(formatCedis(25.5)).toBe("GH₵25.50");
    expect(formatCedis(25.456)).toBe("GH₵25.46");
  });

  it("groups thousands", () => {
    expect(formatCedis(1234.5)).toBe("GH₵1,234.50");
    expect(formatCedis(1_000_000)).toBe("GH₵1,000,000.00");
  });

  it("renders zero rather than an empty string", () => {
    expect(formatCedis(0)).toBe("GH₵0.00");
  });

  it("treats non-finite input as zero", () => {
    // Reached whenever a numeric column comes back null and a caller does
    // Number(null ?? undefined). Showing "GH₵NaN" on a till is worse than 0.
    expect(formatCedis(Number.NaN)).toBe("GH₵0.00");
    expect(formatCedis(Number.POSITIVE_INFINITY)).toBe("GH₵0.00");
  });

  it("keeps the sign on refunds", () => {
    expect(formatCedis(-40)).toBe("GH₵-40.00");
  });
});

describe("formatCedisRange", () => {
  it("collapses to a single price when the range is empty", () => {
    expect(formatCedisRange(20, 20)).toBe("GH₵20.00");
  });

  it("shows a from-price when versions differ", () => {
    expect(formatCedisRange(20, 45)).toBe("From GH₵20.00");
  });

  it("does not care which bound is passed first", () => {
    expect(formatCedisRange(45, 20)).toBe("From GH₵20.00");
  });

  it("falls back to the single price when a bound is not finite", () => {
    expect(formatCedisRange(20, Number.NaN)).toBe("GH₵20.00");
  });
});
