// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildNativeReceiptJob, buildNativeReceiptCalibrationJob } from "./native-print";

describe("native counter receipt jobs", () => {
  it("builds an ASCII TSPL receipt for the continuous roll", () => {
    const job = buildNativeReceiptJob({
      shopName: "Baebe Boo Osu",
      shopLocation: "Oxford Street",
      orderNumber: "BB-POS-12",
      soldAt: "2026-09-09T11:00:00.000Z",
      customerName: "Walk-in Customer",
      paymentLabel: "Cash",
      lines: [{
        productName: "Soft cotton romper",
        variantLabel: "Blue · 3M",
        quantity: 2,
        price: 46,
        lineTotal: 92,
      }],
      total: 92,
    }).toString("ascii");

    expect(job).toContain("SIZE 80 mm,160 mm");
    expect(job).toContain("ORDER BB-POS-12");
    expect(job).toContain("2 x GHS 46.00");
    expect(job).toContain('TEXT 424,462,"0",0,2,2,"GHS 92.00"');
    expect(job).toContain("QRCODE");
    expect(job).toContain("/receipt/counter?order=BB-POS-12&token=");
    expect(job).toContain("PRINT 1,1");
    expect(job).not.toContain("₵");
  });

  it("uses a compact QR zone on the portrait sticker", async () => {
    const { buildNativeLabelJob } = await import("./native-print");
    const job = buildNativeLabelJob([{
      shopName: "Baebe Boo",
      productName: "Cloud-Soft Organic Romper",
      variantLabel: "Blue · 0–3M",
      price: 189,
      sku: "CL-2612345ABC",
      url: "https://example.com/products/cloud-soft-organic-romper-123?sku=CL-2612345ABC",
    }]).toString("ascii");

    expect(job).toContain('QRCODE 16,28,L,2');
    expect(job).toContain('TEXT 12,8,"0",0,1,1,"BAEBE BOO"');
    expect(job).toContain('TEXT 136,44,"0",0,1,1,"SCAN QR"');
    expect(job).toContain('GHS 189.00');
    expect(job).toContain('BARCODE 12,278,"128",44');
    expect(job).toContain('BARCODE 12,278,"128",44,0,0,2,2');
    expect(job).not.toContain('QRCODE 48,16,L,4');
  });

  it("wraps a long product name before the price and barcode zones", async () => {
    const { buildNativeLabelJob } = await import("./native-print");
    const job = buildNativeLabelJob([{
      shopName: "Baebe Boo",
      productName: "Baby 2-Pack Elephant Striped 100% Cotton 2-Way Zip Sleep & Play Pajamas",
      variantLabel: "Ivory/Grey / Newborn",
      price: 330,
      sku: "BB-SEED-014-01",
      url: "https://example.com/products/baby-pajamas?sku=BB-SEED-014-01",
    }]).toString("ascii");

    expect(job).toContain('TEXT 12,158,"0",0,1,1,"Baby 2-Pack Elephant"');
    expect(job).toContain('TEXT 12,175,"0",0,1,1,"Striped 100% Cotton 2-Way"');
    expect(job).toContain('TEXT 12,192,"0",0,1,1,"Zip Sleep & Play Pajamas"');
    expect(job).toContain("GHS 330.00");
    expect(job).toContain('BARCODE 12,278,"128",44,0,0,2,2');
  });

  it("builds an 80 x 160 mm counter printer test page", () => {
    const job = buildNativeReceiptCalibrationJob().toString("ascii");

    expect(job).toContain("SIZE 80 mm,160 mm");
    expect(job).toContain("COUNTER RECEIPT TEST");
    expect(job).not.toContain("SIZE 30 mm,50 mm");
  });
});
