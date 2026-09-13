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
  "30x50": { widthMm: 30, heightMm: 50 },
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

/** Wrap a title into a fixed label zone without letting it push later fields. */
function wrapLabelText(value: string, maxCharacters: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const rawWord of words) {
    let word = rawWord;
    while (word.length > maxCharacters) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, maxCharacters));
      word = word.slice(maxCharacters);
    }
    if (!word) continue;

    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const truncated = lines.length > maxLines;
  const visible = lines.slice(0, maxLines);
  if (truncated && visible.length > 0) {
    const last = visible.length - 1;
    visible[last] = `${visible[last].slice(0, Math.max(0, maxCharacters - 1)).trimEnd()}…`;
  }
  return visible.length > 0 ? visible : [""];
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
  const portrait = heightMm > widthMm;

  for (const [index, label] of labels.entries()) {
    if (index > 0) doc.addPage({ size: [pageWidth, pageHeight], margins: { top: 0, bottom: 0, left: 0, right: 0 } });

    const qr = await qrPng(label.url);
    if (portrait) {
      // A 12mm QR leaves the upper-right zone free for a clear scan prompt.
      // Product copy then gets the full label width below the QR instead of
      // being squeezed into a narrow column or printed over the code.
      const qrSize = 12 / MM_TO_PT;
      const qrX = margin;
      const qrY = 12;
      const textWidth = pageWidth - margin * 2;
      doc.font("bold").fontSize(5.2).fillColor("#111111");
      doc.text(label.shopName.toUpperCase(), margin, 2.5, {
        width: textWidth,
        lineBreak: false,
        ellipsis: true,
      });
      doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

      const sideX = margin + qrSize + 3 / MM_TO_PT;
      const sideWidth = pageWidth - sideX - margin;
      doc.font("bold").fontSize(5.2).fillColor("#111111");
      doc.text("SCAN QR", sideX, qrY + 4, { width: sideWidth, lineBreak: false, ellipsis: true });
      doc.font("regular").fontSize(5.2).fillColor("#444444");
      doc.text("FOR PRODUCT", sideX, qrY + 12, { width: sideWidth, lineBreak: false, ellipsis: true });

      const dividerY = qrY + qrSize + 2.5 / MM_TO_PT;
      doc.moveTo(margin, dividerY).lineTo(pageWidth - margin, dividerY).lineWidth(0.5).stroke("#999999");
      let cursor = dividerY + 3;
      doc.font("bold").fontSize(6.8).fillColor("#111111");
      const nameHeight = doc.heightOfString(label.productName, { width: textWidth });
      const nameLines = Math.min(3, Math.max(1, Math.round(nameHeight / (6.8 * 1.15))));
      doc.text(label.productName, margin, cursor, {
        width: textWidth,
        height: 6.8 * 1.15 * nameLines,
        ellipsis: true,
      });
      cursor += 6.8 * 1.15 * nameLines + 1;
      if (label.variantLabel) {
        doc.font("regular").fontSize(5.2).fillColor("#444444");
        doc.text(label.variantLabel, margin, cursor, { width: textWidth, lineBreak: false, ellipsis: true });
        cursor += 5.2 * 1.15 + 1;
      }
      doc.font("bold").fontSize(9).fillColor("#111111");
      doc.text(formatCedis(label.price), margin, cursor, { width: textWidth, lineBreak: false });

      const barcode = await code128Png(label.sku);
      const barcodeY = pageHeight - margin - 8 / MM_TO_PT - 12;
      doc.image(barcode, margin, barcodeY, {
        width: textWidth,
        height: 8 / MM_TO_PT,
      });
      doc.font("regular").fontSize(4.8).fillColor("#444444");
      doc.text(`SKU ${label.sku}`, margin, barcodeY + 9 / MM_TO_PT, {
        width: textWidth,
        lineBreak: false,
        ellipsis: true,
      });
    } else {
      // Landscape matches the physical reference: a compact QR on the left,
      // readable product information on the right, and the barcode across the
      // bottom. The title is explicitly wrapped and shortened before drawing
      // so even very long catalogue names cannot collide with the price.
      // 15mm gives the customer QR a materially larger scan target while
      // still fitting the reference's left-side code zone.
      const qrSize = 15 / MM_TO_PT;
      const qrX = margin;
      const qrY = 10.5;
      const textX = margin + qrSize + 3 / MM_TO_PT;
      const textWidth = pageWidth - textX - margin;
      doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

      doc.font("bold").fontSize(5.5).fillColor("#111111");
      doc.text(label.shopName.toUpperCase(), margin, 2.5, {
        width: pageWidth - margin * 2,
        lineBreak: false,
        ellipsis: true,
      });
      doc.font("bold").fontSize(5.2).fillColor("#111111");
      doc.text("SCAN QR", textX, qrY + 3, { width: textWidth, lineBreak: false, ellipsis: true });
      doc.font("regular").fontSize(5.2).fillColor("#444444");
      doc.text("OR PRODUCT", textX, qrY + 10, { width: textWidth, lineBreak: false, ellipsis: true });

      const dividerX = textX - 1.5 / MM_TO_PT;
      doc.moveTo(dividerX, 11).lineTo(dividerX, 53).lineWidth(0.5).stroke("#999999");

      const titleFontSize = label.productName.length > 64 ? 5.1 : label.productName.length > 42 ? 5.6 : 6.2;
      const titleLineHeight = titleFontSize * 1.12;
      const titleMaxCharacters = Math.max(14, Math.floor(textWidth / (titleFontSize * 0.52)));
      const titleLines = wrapLabelText(label.productName, titleMaxCharacters, 2);
      doc.font("bold").fontSize(titleFontSize).fillColor("#111111");
      doc.text(titleLines.join("\n"), textX, 14, {
        width: textWidth,
        height: titleLineHeight * 2,
        lineGap: 0,
      });

      const variantLines = wrapLabelText(label.variantLabel, Math.max(14, Math.floor(textWidth / (5.1 * 0.52))), 1);
      doc.font("regular").fontSize(5.1).fillColor("#444444");
      doc.text(variantLines[0] || "", textX, 31, { width: textWidth, lineBreak: false, ellipsis: true });

      doc.font("bold").fontSize(10.2).fillColor("#111111");
      doc.text(formatCedis(label.price), textX, 39, { width: textWidth, lineBreak: false, ellipsis: true });

      const barcode = await code128Png(label.sku);
      const barcodeY = pageHeight - margin - 6.5 / MM_TO_PT - 7;
      doc.image(barcode, margin, barcodeY, {
        width: pageWidth - margin * 2,
        height: 6.5 / MM_TO_PT,
      });
      doc.font("regular").fontSize(4.5).fillColor("#444444");
      doc.text(`SKU ${label.sku}`, margin, barcodeY + 7 / MM_TO_PT, {
        width: pageWidth - margin * 2,
        lineBreak: false,
        ellipsis: true,
        align: "center",
      });
    }
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
  const portrait = heightMm > widthMm;
  const qrSize = (portrait ? 18 : 15) / MM_TO_PT;
  if (portrait) {
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = 10 / MM_TO_PT;
    doc.image(qr, qrX, qrY, { width: qrSize, height: qrSize });

    const barcode = await code128Png("TEST-SKU-123");
    const barcodeY = qrY + qrSize + 4 / MM_TO_PT;
    doc.image(barcode, 4 / MM_TO_PT, barcodeY, {
      width: pageWidth - 8 / MM_TO_PT,
      height: 8 / MM_TO_PT,
    });
    doc.font("bold").fontSize(7).fillColor("#111111");
    doc.text("TEST GH₵123.45", 4 / MM_TO_PT, barcodeY + 10 / MM_TO_PT, {
      width: pageWidth - 8 / MM_TO_PT,
      lineBreak: false,
    });
  } else {
    doc.image(qr, 4, 12, { width: qrSize, height: qrSize });
    const barcode = await code128Png("TEST-SKU-123");
    doc.image(barcode, 4 + qrSize + 4, 12, { width: pageWidth - (4 + qrSize + 4) - 4, height: 8 / MM_TO_PT });
    doc.font("bold").fontSize(7).fillColor("#111111");
    doc.text("TEST GH₵123.45", 4 + qrSize + 4, 12 + 8 / MM_TO_PT + 3, { lineBreak: false });
  }

  return collect(doc);
}
