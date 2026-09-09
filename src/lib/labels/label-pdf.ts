import "server-only";

import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import { formatCedis } from "@/domain/money";
import { loadReceiptAssets } from "@/lib/pdf/receipt-assets";

/**
 * Shelf labels for the XP-365B thermal printer (203 DPI, 76mm max width).
 *
 * One PDF page per label at the EXACT label size — the printer driver must not
 * scale anything ("Actual size", not "Fit"). Thermal rolls are gap-sensed, so
 * each page feeds exactly one sticker.
 *
 * A label carries two machine codes on purpose:
 * - QR  → the product page URL with `?sku=`, for CUSTOMERS (scan to view/buy).
 * - Code128 → the bare variant SKU, for the TILL (scan-to-add, phase 2).
 * The price is human text only, never encoded: prices change and a sticker
 * with a baked-in price becomes a lie you have to peel off.
 */

const MM_TO_PT = 25.4 / 72;

export const LABEL_SIZES = {
  "50x30": { widthMm: 50, heightMm: 30 },
} as const;

export type LabelSizeId = keyof typeof LABEL_SIZES;

export type ShelfLabel = {
  shopName: string;
  productName: string;
  variantLabel: string;
  /** Unit price in cedis. */
  price: number;
  /** Variant SKU, also the Code128 payload. */
  sku: string;
  /** Full product page URL, the QR payload. */
  url: string;
};

export function labelQrPayload(siteUrl: string, productSlug: string, sku: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/products/${productSlug}?sku=${encodeURIComponent(sku)}`;
}

export function labelFilename(count: number): string {
  return `baebe-boo-labels-${count}.pdf`;
}

type Doc = PDFKit.PDFDocument;

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

async function qrPng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "qrcode",
    text,
    // Error correction M: stickers get handled, and a scuffed QR that still
    // scans beats a pristine one that does not.
    eclevel: "M",
    scale: 4,
    includetext: false,
  });
}

async function code128Png(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 3,
    // Height in modules; the placed height is set at draw time.
    height: 12,
    includetext: false,
  });
}

/**
 * Render shelf labels, one exact-size page each.
 *
 * Throws ReceiptAssetError when the vendored fonts are missing — same rule as
 * receipts: no cedi glyph, no document.
 */
export async function renderShelfLabelsPdf(
  labels: ShelfLabel[],
  sizeId: LabelSizeId = "50x30",
): Promise<Buffer> {
  if (labels.length === 0) throw new Error("At least one label is required.");
  if (labels.length > 200) throw new Error("Print at most 200 labels at a time.");
  const assets = loadReceiptAssets();
  const { widthMm, heightMm } = LABEL_SIZES[sizeId];
  const pageWidth = widthMm / MM_TO_PT;
  const pageHeight = heightMm / MM_TO_PT;

  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: { Title: "Baebe Boo shelf labels", Creator: "Baebe Boo" },
  });
  doc.registerFont("regular", assets.regular);
  doc.registerFont("bold", assets.bold);

  const margin = 2 / MM_TO_PT;
  // QR almost full-height on the left; text stacks on the right.
  const qrSize = pageHeight - margin * 2;
  const textX = margin + qrSize + 2.5 / MM_TO_PT;
  const textWidth = pageWidth - textX - margin;

  for (const [index, label] of labels.entries()) {
    if (index > 0) doc.addPage({ size: [pageWidth, pageHeight], margins: { top: 0, bottom: 0, left: 0, right: 0 } });

    const qr = await qrPng(label.url);
    doc.image(qr, margin, margin, { width: qrSize, height: qrSize });

    let cursor = margin + 1;
    const line = (text: string, size: number, font: "regular" | "bold", gapAfter = 1.2) => {
      doc.font(font).fontSize(size).fillColor("#111111");
      doc.text(text, textX, cursor, { width: textWidth, lineBreak: false, ellipsis: true });
      cursor += size * 1.15 + gapAfter;
    };

    line(label.shopName.toUpperCase(), 5.5, "bold");
    // Name gets two lines; everything else one.
    doc.font("bold").fontSize(7.5).fillColor("#111111");
    const nameHeight = doc.heightOfString(label.productName, { width: textWidth });
    const nameLines = Math.min(2, Math.max(1, Math.round(nameHeight / (7.5 * 1.15))));
    doc.text(label.productName, textX, cursor, { width: textWidth, height: 7.5 * 1.15 * nameLines, ellipsis: true });
    cursor += 7.5 * 1.15 * nameLines + 1;
    if (label.variantLabel) line(label.variantLabel, 6, "regular", 1);
    doc.font("bold").fontSize(11.5).fillColor("#111111");
    doc.text(formatCedis(label.price), textX, cursor, { width: textWidth, lineBreak: false });
    cursor += 11.5 * 1.15 + 1;
    doc.font("regular").fontSize(5.5).fillColor("#444444");
    doc.text(label.sku, textX, cursor, { width: textWidth, lineBreak: false });
  }

  return collect(doc);
}

/**
 * One calibration page at the label size: a true-size border to check against
 * a ruler, a test QR, a test barcode and type samples. Print this FIRST on the
 * XP-365B — if the border measures 50×30mm and the phone scans both codes,
 * the batch will be right.
 */
export async function renderLabelCalibrationPdf(sizeId: LabelSizeId = "50x30"): Promise<Buffer> {
  const assets = loadReceiptAssets();
  const { widthMm, heightMm } = LABEL_SIZES[sizeId];
  const pageWidth = widthMm / MM_TO_PT;
  const pageHeight = heightMm / MM_TO_PT;

  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: { Title: "Baebe Boo label calibration", Creator: "Baebe Boo" },
  });
  doc.registerFont("regular", assets.regular);
  doc.registerFont("bold", assets.bold);

  // True-size border: measure this with a ruler. 50×30 or the driver scaled it.
  doc.rect(1, 1, pageWidth - 2, pageHeight - 2).lineWidth(0.75).stroke("#111111");

  // Millimetre ruler along the top edge.
  doc.font("regular").fontSize(4).fillColor("#111111");
  for (let mm = 0; mm <= widthMm; mm += 1) {
    const x = 1 + mm / MM_TO_PT;
    const tall = mm % 5 === 0;
    doc.moveTo(x, 1).lineTo(x, tall ? 7 : 4.5).lineWidth(0.5).stroke("#111111");
    if (tall && mm > 0 && mm < widthMm) doc.text(String(mm), x + 0.75, 2.5, { lineBreak: false });
  }

  const qr = await qrPng("https://baebe-boo.jtechinnovations.tech/products/calibration-test?sku=TEST-SKU");
  const qrSize = 15 / MM_TO_PT;
  doc.image(qr, 4, 12, { width: qrSize, height: qrSize });

  const barcode = await code128Png("TEST-SKU-123");
  doc.image(barcode, 4 + qrSize + 4, 12, { width: pageWidth - (4 + qrSize + 4) - 4, height: 8 / MM_TO_PT });

  doc.font("bold").fontSize(7).fillColor("#111111");
  doc.text("TEST GH₵123.45", 4 + qrSize + 4, 12 + 8 / MM_TO_PT + 3, { lineBreak: false });

  return collect(doc);
}
