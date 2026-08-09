// @vitest-environment node
import { create as createFont, type Font } from "fontkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdfText, pdfPageCount } from "@/test/pdf-text";
import type { ReceiptOrder } from "@/lib/orders/receipt-order";

vi.mock("@/lib/supabase-admin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {},
}));
vi.mock("@/lib/supabase/server", () => ({
  tryCreateServerSupabaseClient: async () => null,
}));

import { loadReceiptAssets, resetReceiptAssetsCache } from "./receipt-assets";
import { receiptPdfFilename, renderReceiptPdf, tryRenderReceiptPdf } from "./receipt-pdf";

beforeEach(() => {
  resetReceiptAssetsCache();
});

function makeOrder(overrides: Partial<ReceiptOrder> = {}): ReceiptOrder {
  return {
    id: "order-1",
    orderNumber: "BB-1001",
    recordCode: null,
    customerName: "Ama Mensah",
    customerEmail: "ama@example.com",
    customerPhone: "+233240000000",
    deliveryAddress: "12 Oxford Street, Osu, Accra",
    digitalAddress: "GA-123-4567",
    orderStatus: "received",
    paymentStatus: "paid",
    orderType: "online",
    totalAmount: 1234,
    voucherCredit: 0,
    createdAt: "2026-08-08T21:26:09.387Z",
    shop: { name: "Baebe Boo Sakumono", address: "Sakumono", phone: "+233240000001" },
    items: [
      {
        id: "i1",
        productName: "Baby Organic Cotton Sweater Knit Jumpsuit",
        quantity: 1,
        unitPrice: 395,
        totalPrice: 395,
      },
    ],
    payments: [
      {
        id: "p1",
        provider: "paystack",
        providerReference: "xxuz4dv3cf",
        amount: 1234,
        status: "paid",
        verifiedAt: "2026-08-08T21:26:18.678Z",
      },
    ],
    appliedDiscount: 0,
    deliveryFee: 0,
    ...overrides,
  };
}

describe("the PDF receipt", () => {
  it("returns a document a PDF reader will accept", async () => {
    const pdf = await renderReceiptPdf(makeOrder());
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    // A size band, as the cheap regression net: far below this means the fonts
    // silently failed to embed, far above means somebody put the 352 KB source
    // PNG back in place of the JPEG derivative.
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(pdf.length).toBeLessThan(400_000);
  });

  it("prints the Ghanaian cedi sign rather than a missing glyph", async () => {
    // TWO assertions are needed, and the reason is subtle. PDFKit builds its
    // ToUnicode CMap from the INPUT code points, so a .notdef box still round
    // trips as "₵" through text extraction while rendering as a blank. Glyph
    // coverage is what proves the customer actually sees a cedi sign;
    // extraction is what proves it is selectable and copyable.
    const font = createFont(loadReceiptAssets().regular) as Font;
    expect(font.hasGlyphForCodePoint(0x20b5)).toBe(true);
    expect(font.layout("GH₵1,234.00").glyphs.some((glyph) => glyph.id === 0)).toBe(false);

    const pdf = await renderReceiptPdf(makeOrder({ totalAmount: 1234 }));
    expect(extractPdfText(pdf)).toContain("GH₵1,234.00");
  });

  it("puts every line item, its unit price and its line total on the page", async () => {
    const pdf = await renderReceiptPdf(
      makeOrder({
        items: [
          { id: "a", productName: "Cotton Sleepsuit", quantity: 2, unitPrice: 100, totalPrice: 200 },
          { id: "b", productName: "Sun Hat", quantity: 1, unitPrice: 50, totalPrice: 50 },
        ],
      }),
    );
    const text = extractPdfText(pdf);
    expect(text).toContain("Cotton Sleepsuit");
    expect(text).toContain("Sun Hat");
    expect(text).toContain("GH₵100.00");
    expect(text).toContain("GH₵200.00");
  });

  it("prefers the stored total over the one recomputed from the lines", async () => {
    const pdf = await renderReceiptPdf(makeOrder({ totalAmount: 999 }));
    expect(extractPdfText(pdf)).toContain("GH₵999.00");
  });

  it("falls back to the computed total when the order has none stored", async () => {
    const pdf = await renderReceiptPdf(
      makeOrder({
        totalAmount: 0,
        items: [{ id: "a", productName: "Bib", quantity: 1, unitPrice: 500, totalPrice: 500 }],
        appliedDiscount: 50,
        deliveryFee: 20,
      }),
    );
    expect(extractPdfText(pdf)).toContain("GH₵470.00");
  });

  it("never prints a negative total, however large the discount", async () => {
    const pdf = await renderReceiptPdf(
      makeOrder({
        totalAmount: 0,
        items: [{ id: "a", productName: "Bib", quantity: 1, unitPrice: 35, totalPrice: 35 }],
        appliedDiscount: 100,
      }),
    );
    const text = extractPdfText(pdf);
    expect(text).toContain("GH₵0.00");
    expect(text).not.toContain("-GH₵65.00");
  });

  it("shows the discount and delivery lines only when there are any", async () => {
    const without = extractPdfText(await renderReceiptPdf(makeOrder()));
    expect(without).not.toContain("Discount");
    expect(without).not.toContain("Delivery");

    const withBoth = extractPdfText(
      await renderReceiptPdf(makeOrder({ appliedDiscount: 59.25, deliveryFee: 25 })),
    );
    expect(withBoth).toContain("Discount");
    expect(withBoth).toContain("-GH₵59.25");
    expect(withBoth).toContain("GH₵25.00");
  });

  it("names an unidentified buyer as a guest customer", async () => {
    const pdf = await renderReceiptPdf(makeOrder({ customerName: null }));
    expect(extractPdfText(pdf)).toContain("Guest customer");
  });

  it("leaves out the shop block when the order has no shop", async () => {
    const pdf = await renderReceiptPdf(makeOrder({ shop: null }));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(extractPdfText(pdf)).not.toContain("FROM");
  });

  it("says so when an order has no item detail", async () => {
    const pdf = await renderReceiptPdf(makeOrder({ items: [] }));
    expect(extractPdfText(pdf)).toContain("No item details available.");
  });

  it("flows a long order onto more than one page without dropping a line", async () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      id: `i${index}`,
      productName: `Test Product Number ${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
    }));
    const pdf = await renderReceiptPdf(makeOrder({ items, totalAmount: 600 }));

    expect(pdfPageCount(pdf)).toBeGreaterThanOrEqual(2);
    const text = extractPdfText(pdf);
    expect(text).toContain("Test Product Number 1 ");
    expect(text).toContain("Test Product Number 60");
    expect(text).toContain("GH₵600.00"); // the totals block survived the flow
  });

  it("repeats the column headings on every page", async () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      id: `i${index}`,
      productName: `Product ${index}`,
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
    }));
    const pdf = await renderReceiptPdf(makeOrder({ items }));
    const headings = extractPdfText(pdf).match(/PRODUCT/g) || [];
    expect(headings.length).toBeGreaterThanOrEqual(pdfPageCount(pdf));
  });

  it("numbers the pages when there is more than one", async () => {
    const items = Array.from({ length: 60 }, (_, index) => ({
      id: `i${index}`,
      productName: `Product ${index}`,
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
    }));
    const pdf = await renderReceiptPdf(makeOrder({ items }));
    expect(extractPdfText(pdf)).toMatch(/Page 1 of \d/);
  });

  it("does not put the customer's name or email in the document metadata", async () => {
    // The body is the receipt; the metadata dictionary survives every copy of
    // the file and has no business carrying personal data.
    const pdf = await renderReceiptPdf(makeOrder());
    const raw = pdf.toString("latin1");
    const info = raw.slice(raw.indexOf("/Producer"), raw.indexOf("/Producer") + 600);
    expect(info).not.toContain("Ama Mensah");
    expect(info).not.toContain("ama@example.com");
  });

  it("truncates a pathological product name rather than letting it eat the page", async () => {
    const pdf = await renderReceiptPdf(
      makeOrder({
        items: [
          {
            id: "a",
            productName: "X".repeat(2000),
            quantity: 1,
            unitPrice: 10,
            totalPrice: 10,
          },
        ],
      }),
    );
    expect(pdfPageCount(pdf)).toBeLessThanOrEqual(2);
  });
});

describe("when an asset is missing", () => {
  it("still produces a receipt without the logo, which is decoration", async () => {
    const assets = loadReceiptAssets();
    vi.doMock("./receipt-assets", () => ({
      loadReceiptAssets: () => ({ ...assets, logo: null }),
      resetReceiptAssetsCache: () => {},
      ReceiptAssetError: Error,
    }));
    vi.resetModules();
    const { renderReceiptPdf: render } = await import("./receipt-pdf");

    const pdf = await render(makeOrder());
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(extractPdfText(pdf)).toContain("GH₵1,234.00");

    vi.doUnmock("./receipt-assets");
    vi.resetModules();
  });

  it("refuses to render without the fonts, rather than printing money with a hole in it", async () => {
    vi.doMock("./receipt-assets", () => ({
      loadReceiptAssets: () => {
        throw new Error("Receipt fonts are missing from the deployment.");
      },
      resetReceiptAssetsCache: () => {},
      ReceiptAssetError: Error,
    }));
    vi.resetModules();
    const mod = await import("./receipt-pdf");

    await expect(mod.renderReceiptPdf(makeOrder())).rejects.toThrow(/fonts are missing/);

    const attempt = await mod.tryRenderReceiptPdf(makeOrder());
    expect(attempt.pdf).toBeNull();
    expect(attempt.reason).toMatch(/fonts are missing/);

    vi.doUnmock("./receipt-assets");
    vi.resetModules();
  });
});

describe("tryRenderReceiptPdf", () => {
  it("returns a buffer on the happy path, so the caller can attach it", async () => {
    const result = await tryRenderReceiptPdf(makeOrder());
    expect(result.pdf).toBeInstanceOf(Buffer);
    expect(result.reason).toBeUndefined();
  });
});

describe("receiptPdfFilename", () => {
  it("names the file after the order", () => {
    expect(receiptPdfFilename("BB-1001")).toBe("baebe-boo-receipt-BB-1001.pdf");
  });

  it("strips a quote so it cannot break out of the Content-Disposition header", () => {
    // The order number reaches the download route from a URL, so it is not
    // trusted: an unescaped quote would let a caller inject header content.
    const name = receiptPdfFilename('BB"; attachment; filename="evil');
    expect(name).not.toContain('"');
    expect(name).not.toContain(";");
  });

  it("falls back to a usable name when the order number is unusable", () => {
    expect(receiptPdfFilename("!!!")).toBe("baebe-boo-receipt----.pdf");
    expect(receiptPdfFilename("")).toBe("baebe-boo-receipt-receipt.pdf");
  });
});
