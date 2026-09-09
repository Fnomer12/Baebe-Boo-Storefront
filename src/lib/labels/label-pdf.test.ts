// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pdfPageCount } from "@/test/pdf-text";
import {
  labelFilename,
  labelQrPayload,
  renderLabelCalibrationPdf,
  renderShelfLabelsPdf,
  type ShelfLabel,
} from "./label-pdf";

function label(overrides: Partial<ShelfLabel> = {}): ShelfLabel {
  return {
    shopName: "Baebe Boo",
    productName: "Cloud-Soft Organic Romper",
    variantLabel: "Blue · 0–3M",
    price: 189,
    sku: "CL-2612345ABC",
    url: "https://example.com/products/cloud-soft-organic-romper-123?sku=CL-2612345ABC",
    ...overrides,
  };
}

function pageCount(pdf: Buffer): number {
  return pdfPageCount(pdf);
}

describe("labelQrPayload", () => {
  it("points at the product page and carries the SKU for the till", () => {
    expect(labelQrPayload("https://shop.example.com/", "romper-123", "CL-ABC")).toBe(
      "https://shop.example.com/products/romper-123?sku=CL-ABC",
    );
  });
});

describe("renderShelfLabelsPdf", () => {
  it("renders one exact-size page per label", async () => {
    const pdf = await renderShelfLabelsPdf([label(), label({ sku: "CL-EMPTY", variantLabel: "" })]);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(pdf)).toBe(2);
  });

  it("refuses an empty or oversized batch rather than hanging the server", async () => {
    await expect(renderShelfLabelsPdf([])).rejects.toThrow(/at least one/i);
    await expect(
      renderShelfLabelsPdf(Array.from({ length: 201 }, () => label())),
    ).rejects.toThrow(/at most 200/i);
  });

  it("names the file after the sticker count", () => {
    expect(labelFilename(12)).toBe("baebe-boo-labels-12.pdf");
  });
});

describe("renderLabelCalibrationPdf", () => {
  it("renders a single test page", async () => {
    const pdf = await renderLabelCalibrationPdf();

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(pdf)).toBe(1);
  });
});
