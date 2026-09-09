// @vitest-environment node
import { describe, expect, it } from "vitest";
import { counterReceiptUrl, verifyCounterReceiptToken } from "./receipt-link";

describe("counter receipt links", () => {
  it("creates a signed digital receipt URL that verifies for the same order", () => {
    const url = counterReceiptUrl("BB-POS-12");
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token");

    expect(parsed.pathname).toBe("/receipt/counter");
    expect(parsed.searchParams.get("order")).toBe("BB-POS-12");
    expect(token).toBeTruthy();
    expect(verifyCounterReceiptToken("BB-POS-12", token || "")).toBe(true);
    expect(verifyCounterReceiptToken("BB-POS-13", token || "")).toBe(false);
  });
});
