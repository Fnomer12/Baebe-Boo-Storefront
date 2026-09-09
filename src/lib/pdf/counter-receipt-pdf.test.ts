// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  counterReceiptFilename,
  renderCounterReceiptPdf,
} from "./counter-receipt-pdf";

describe("renderCounterReceiptPdf", () => {
  it("renders a receipt with variant lines", async () => {
    const pdf = await renderCounterReceiptPdf({
      shopName: "Baebe Boo Osu",
      shopLocation: "Osu, Accra",
      orderNumber: "BB-POS-1",
      soldAt: new Date("2026-09-04T10:30:00Z").toISOString(),
      customerName: "Ama",
      paymentLabel: "Cash",
      lines: [
        { productName: "Cloud-Soft Romper", variantLabel: "Blue · 0–3M", quantity: 2, price: 189, lineTotal: 378 },
        { productName: "Feeding Bottle", variantLabel: "", quantity: 1, price: 85, lineTotal: 85 },
      ],
      total: 463,
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const text = pdf.toString("latin1");
    expect(text).toContain("BB-POS-1");
  });

  it("refuses an empty receipt", async () => {
    await expect(
      renderCounterReceiptPdf({
        shopName: "Shop",
        shopLocation: "",
        orderNumber: "BB-POS-2",
        soldAt: "",
        customerName: "",
        paymentLabel: "Cash",
        lines: [],
        total: 0,
      }),
    ).rejects.toThrow(/at least one line/i);
  });

  it("sanitises the filename so the order number cannot inject headers", () => {
    expect(counterReceiptFilename('BB-POS-1"\r\nX: y')).toBe("baebe-boo-receipt-BB-POS-1-X-y.pdf");
  });
});
