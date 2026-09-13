// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildNativeCalibrationJob, buildNativeReceiptJob, buildNativeReceiptCalibrationJob } from "./native-print";

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

  it("keeps the enlarged landscape QR separate from a bounded text column", async () => {
    const { buildNativeLabelJob } = await import("./native-print");
    const job = buildNativeLabelJob([{
      shopName: "Baebe Boo",
      productName: "Cloud-Soft Organic Romper",
      variantLabel: "Blue · 0–3M",
      price: 189,
      sku: "CL-2612345ABC",
      url: "https://example.com/products/cloud-soft-organic-romper-123?sku=CL-2612345ABC",
    }]).toString("ascii");

    expect(job).toContain("SIZE 50 mm,30 mm");
    expect(job).toContain('QRCODE 12,28,L,3');
    expect(job).toContain('TEXT 16,8,"0",0,1,1,"BAEBE BOO"');
    expect(job).toContain('BAR 198,12,1,128');
    expect(job).toContain('TEXT 210,8,"0",0,1,1,"SCAN QR"');
    expect(job).toContain('GHS 189.00');
    expect(job).toContain('BARCODE 12,158,"128",36,0,0,2,2');
    expect(job).toContain("PRINT 1,1");
    expect(job).not.toContain('SIZE 30 mm,50 mm');
  });

  it("keeps every element inside the 50x30mm dot area", async () => {
    const { buildNativeLabelJob } = await import("./native-print");
    const job = buildNativeLabelJob([{
      shopName: "Baebe Boo",
      productName: "Baby 2-Pack Elephant Striped 100% Cotton 2-Way Zip Sleep & Play Pajamas",
      variantLabel: "Ivory/Grey / Newborn",
      price: 330,
      sku: "BB-SEED-014-01",
      url: "https://example.com/products/baby-pajamas?sku=BB-SEED-014-01",
    }]).toString("ascii");

    // 50x30mm at 203dpi ≈ 400x240 dots; every y must fit.
    for (const match of job.matchAll(/^(?:TEXT|QRCODE|BARCODE|BAR|BOX) (\d+),(\d+)/gm)) {
      expect(Number(match[2])).toBeLessThan(240);
    }
    expect(job).toContain("GHS 330.00");
  });

  it("shortens extremely long product names before the fixed price zone", async () => {
    const { buildNativeLabelJob } = await import("./native-print");
    const job = buildNativeLabelJob([{
      shopName: "Baebe Boo",
      productName: "A Very Long Product Name With Many Descriptive Words For Newborn Babies And Toddlers That Must Stay Inside The Sticker",
      variantLabel: "Grey / Ivory / 6M",
      price: 360,
      sku: "BB-SEED-018-03",
      url: "https://example.com/products/long-product?sku=BB-SEED-018-03",
    }]).toString("ascii");

    expect(job).toContain("...");
    expect(job).toContain('TEXT 210,87,"0",0,2,2,"GHS 360.00"');
    expect(job).toContain('BARCODE 12,158,"128",36,0,0,2,2');
  });

  it("still renders portrait for tills loaded with 30x50mm stock", async () => {
    const { buildNativeLabelJob } = await import("./native-print");
    const job = buildNativeLabelJob([{
      shopName: "Baebe Boo",
      productName: "Cloud-Soft Organic Romper",
      variantLabel: "Blue · 0–3M",
      price: 189,
      sku: "CL-2612345ABC",
      url: "https://example.com/products/cloud-soft-organic-romper-123?sku=CL-2612345ABC",
    }], "30x50").toString("ascii");

    expect(job).toContain("SIZE 30 mm,50 mm");
    expect(job).toContain('QRCODE 16,28,L,2');
    expect(job).toContain('BARCODE 12,278,"128",44,0,0,2,2');
    expect(job).not.toContain('QRCODE 48,16,L,4');
  });

  it("builds an 80 x 160 mm counter printer test page", () => {
    const job = buildNativeReceiptCalibrationJob().toString("ascii");

    expect(job).toContain("SIZE 80 mm,160 mm");
    expect(job).toContain("COUNTER RECEIPT TEST");
    expect(job).not.toContain("SIZE 50 mm,30 mm");
  });

  it("builds the label test page landscape for 50x30mm stock", () => {
    const job = buildNativeCalibrationJob().toString("ascii");

    expect(job).toContain("SIZE 50 mm,30 mm");
    expect(job).toContain("50 x 30 MM");
    expect(job).toContain("PRINT 1,1");
    for (const match of job.matchAll(/^(?:TEXT|QRCODE|BARCODE|BAR|BOX) (\d+),(\d+)/gm)) {
      expect(Number(match[2])).toBeLessThan(240);
    }
  });
});
