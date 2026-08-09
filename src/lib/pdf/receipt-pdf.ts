import "server-only";

import PDFDocument from "pdfkit";
import { BRAND } from "@/domain/brand";
import { formatCedis } from "@/domain/money";
import {
  formatReceiptDate,
  formatReceiptDateTime,
  receiptTotals,
  statusLabel,
  type ReceiptOrder,
} from "@/lib/orders/receipt-order";
import { loadReceiptAssets } from "@/lib/pdf/receipt-assets";

/**
 * The PDF receipt.
 *
 * Drawn programmatically rather than by printing the web page in a headless
 * browser. This runs inside the Paystack verify/webhook path, on a box shared
 * with seventeen other pm2 apps and several gigabytes into swap; a Chromium
 * instance is ~300 MB resident per render and its failure mode there is the OOM
 * killer picking an unrelated service. PDFKit renders this document in tens of
 * milliseconds and a few megabytes.
 *
 * Layout deliberately mirrors `src/components/account/OrderReceipt.tsx`, and
 * both read `receiptTotals` for the money, so the printed page and the PDF
 * cannot come to disagree about what a customer paid.
 */

// A4, in points.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 499.28
const FOOTER_RESERVE = 46;
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_RESERVE;

// The palette, flattened — PDF fills and strokes take solid colours.
const INK = BRAND.ink;
const INK_SOFT = BRAND.inkSoft;
const ACCENT = BRAND.brandDeep;
const HAIRLINE = BRAND.lineOnSurface;
const ROW_RULE = "#f1f0f0";
const TINT = BRAND.brandTint;

// Item table columns, as offsets from the left margin.
const COL_PRODUCT = 0;
const COL_QTY = 259.28;
const COL_PRICE = 307.28;
const COL_TOTAL = 395.28;
const WIDTH_PRODUCT = COL_QTY - COL_PRODUCT - 8;
const WIDTH_QTY = 40;
const WIDTH_PRICE = 80;
const WIDTH_TOTAL = 104;

/** A filename a mail client and a browser can both save without argument. */
export function receiptPdfFilename(orderNumber: string): string {
  // The order number reaches the download routes from a URL segment, so it is
  // not trusted here. A quote would break out of the quoted filename in a
  // `Content-Disposition` header and let a caller inject header content.
  const safe = String(orderNumber).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64);
  return `baebe-boo-receipt-${safe || "receipt"}.pdf`;
}

/** Keep pathological free text from eating a page. */
function clamp(value: string | null | undefined, max = 120): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type Doc = PDFKit.PDFDocument;

/**
 * Render a receipt. Throws on a missing font or a malformed order.
 *
 * Callers on the paid-order path must use `tryRenderReceiptPdf` instead.
 */
export async function renderReceiptPdf(order: ReceiptOrder): Promise<Buffer> {
  const assets = loadReceiptAssets();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    // Skips loading Helvetica and its .afm metrics entirely. PDFKit's
    // `initFonts` guards with `if (defaultFont)`, and webpack does not emit
    // those .afm files — so without this, touching a standard font would throw
    // ENOENT inside a payment handler.
    font: "",
    info: {
      Title: `Receipt ${clamp(order.orderNumber, 64)}`,
      Author: "Baebe Boo",
      // Nothing customer-identifying goes in the metadata. The name and email
      // belong in the body, not in a dictionary that survives every copy.
    },
  });

  // Attached before any drawing and before any await: if `doc.end()` were ever
  // reached with no `end` listener, this promise would hang for ever, which
  // inside a webhook is worse than throwing.
  const chunks: Buffer[] = [];
  const collected = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("body", assets.regular);
  doc.registerFont("strong", assets.bold);

  let y = drawHeader(doc, order, assets.logo);
  y = drawParties(doc, order, y);
  y = drawItems(doc, order, y);
  y = drawTotals(doc, order, y);
  drawPayments(doc, order, y);
  drawFooters(doc);

  doc.flushPages();
  doc.end();
  return collected;
}

/**
 * Render a receipt, or explain why there isn't one. Never throws.
 *
 * This module is what knows how PDF generation can fail, so it owns the
 * degradation rather than pushing that knowledge onto the paid-order path.
 */
export async function tryRenderReceiptPdf(
  order: ReceiptOrder,
): Promise<{ pdf: Buffer; reason?: undefined } | { pdf: null; reason: string }> {
  try {
    return { pdf: await renderReceiptPdf(order) };
  } catch (error) {
    return {
      pdf: null,
      reason: error instanceof Error ? error.message : "receipt-pdf-failed",
    };
  }
}

function label(doc: Doc, text: string, x: number, y: number): number {
  doc
    .font("strong")
    .fontSize(7.5)
    .fillColor(INK_SOFT)
    .text(text.toUpperCase(), x, y, { characterSpacing: 1.2 });
  return y + 13;
}

function rule(doc: Doc, y: number, color: string = HAIRLINE): void {
  doc
    .save()
    .moveTo(MARGIN, y)
    .lineTo(PAGE_WIDTH - MARGIN, y)
    .lineWidth(0.5)
    .strokeColor(color)
    .stroke()
    .restore();
}

function drawHeader(doc: Doc, order: ReceiptOrder, logo: Buffer | null): number {
  const top = MARGIN;
  let textX = MARGIN;

  if (logo) {
    // Constrained by height: the artwork is portrait (~0.669 aspect), so fixing
    // the width instead would squash it.
    doc.image(logo, MARGIN, top, { height: 46 });
    textX = MARGIN + 46 * 0.669 + 12;
  }

  doc.font("strong").fontSize(20).fillColor(INK).text("Baebe Boo", textX, top + 4);
  doc
    .font("body")
    .fontSize(8.5)
    .fillColor(INK_SOFT)
    .text("Premium baby & family essentials", textX, top + 28);

  const rightX = MARGIN + CONTENT_WIDTH - 220;
  doc
    .font("strong")
    .fontSize(13)
    .fillColor(INK)
    .text(clamp(order.orderNumber, 40), rightX, top + 2, { width: 220, align: "right" });

  let rightY = top + 20;
  if (order.recordCode) {
    doc
      .font("body")
      .fontSize(9)
      .fillColor(INK_SOFT)
      .text(clamp(order.recordCode, 40), rightX, rightY, { width: 220, align: "right" });
    rightY += 13;
  }
  doc
    .font("body")
    .fontSize(9)
    .fillColor(INK_SOFT)
    .text(formatReceiptDate(order.createdAt), rightX, rightY, {
      width: 220,
      align: "right",
    });

  const y = top + 62;
  rule(doc, y);
  return y + 18;
}

function drawParties(doc: Doc, order: ReceiptOrder, startY: number): number {
  // Side by side rather than the web's stacked blocks: the content is identical
  // but the vertical budget on A4 is not.
  const columnWidth = 230;
  const leftX = MARGIN;
  const rightX = MARGIN + CONTENT_WIDTH - columnWidth;

  let leftY = label(doc, "Bill to", leftX, startY);
  doc
    .font("strong")
    .fontSize(10)
    .fillColor(INK)
    .text(clamp(order.customerName) || "Guest customer", leftX, leftY, {
      width: columnWidth,
    });
  leftY = doc.y + 1;

  for (const line of [order.customerEmail, order.customerPhone]) {
    if (!line) continue;
    doc.font("body").fontSize(9).fillColor(INK_SOFT).text(clamp(line), leftX, leftY, {
      width: columnWidth,
    });
    leftY = doc.y + 1;
  }

  if (order.deliveryAddress) {
    doc
      .font("body")
      .fontSize(9)
      .fillColor(INK_SOFT)
      .text(clamp(order.deliveryAddress, 200), leftX, leftY + 4, { width: columnWidth });
    leftY = doc.y + 1;
  }
  if (order.digitalAddress) {
    doc
      .font("body")
      .fontSize(9)
      .fillColor(INK_SOFT)
      .text(`GhanaPost GPS: ${clamp(order.digitalAddress, 40)}`, leftX, leftY, {
        width: columnWidth,
      });
    leftY = doc.y + 1;
  }

  let rightY = startY;
  if (order.shop) {
    rightY = label(doc, "From", rightX, startY);
    doc
      .font("strong")
      .fontSize(10)
      .fillColor(INK)
      .text(clamp(order.shop.name), rightX, rightY, { width: columnWidth });
    rightY = doc.y + 1;
    for (const line of [order.shop.address, order.shop.phone]) {
      if (!line) continue;
      doc.font("body").fontSize(9).fillColor(INK_SOFT).text(clamp(line), rightX, rightY, {
        width: columnWidth,
      });
      rightY = doc.y + 1;
    }
  }

  return Math.max(leftY, rightY) + 18;
}

function drawTableHead(doc: Doc, y: number): number {
  doc.font("strong").fontSize(7.5).fillColor(INK_SOFT);
  doc.text("PRODUCT", MARGIN + COL_PRODUCT, y, { characterSpacing: 1.2 });
  doc.text("QTY", MARGIN + COL_QTY, y, { width: WIDTH_QTY, align: "right" });
  doc.text("PRICE", MARGIN + COL_PRICE, y, { width: WIDTH_PRICE, align: "right" });
  doc.text("TOTAL", MARGIN + COL_TOTAL, y, { width: WIDTH_TOTAL, align: "right" });
  const next = y + 14;
  rule(doc, next);
  return next + 8;
}

function drawItems(doc: Doc, order: ReceiptOrder, startY: number): number {
  let y = label(doc, "Items", MARGIN, startY);
  y = drawTableHead(doc, y);

  if (order.items.length === 0) {
    doc
      .font("body")
      .fontSize(9)
      .fillColor(INK_SOFT)
      .text("No item details available.", MARGIN, y + 4, {
        width: CONTENT_WIDTH,
        align: "center",
      });
    return y + 26;
  }

  for (const item of order.items) {
    const name = clamp(item.productName, 160);
    const nameHeight = doc
      .font("body")
      .fontSize(9.5)
      .heightOfString(name, { width: WIDTH_PRODUCT });
    const rowHeight = Math.max(16, nameHeight + 10);

    // Manual pagination. Headings repeat, because a table continuing onto a
    // second page with no columns is unreadable.
    if (y + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      y = drawTableHead(doc, MARGIN);
    }

    doc.font("body").fontSize(9.5).fillColor(INK);
    doc.text(name, MARGIN + COL_PRODUCT, y, {
      width: WIDTH_PRODUCT,
      height: rowHeight,
      ellipsis: true,
    });
    doc.text(String(item.quantity), MARGIN + COL_QTY, y, {
      width: WIDTH_QTY,
      align: "right",
    });
    doc.text(formatCedis(item.unitPrice), MARGIN + COL_PRICE, y, {
      width: WIDTH_PRICE,
      align: "right",
    });
    doc
      .font("strong")
      .text(formatCedis(item.totalPrice), MARGIN + COL_TOTAL, y, {
        width: WIDTH_TOTAL,
        align: "right",
      });

    y += rowHeight;
    rule(doc, y - 4, ROW_RULE);
  }

  return y + 12;
}

function drawTotals(doc: Doc, order: ReceiptOrder, startY: number): number {
  const { subtotal, displayTotal } = receiptTotals(order);

  const rows: { label: string; value: string; accent?: boolean }[] = [
    { label: "Subtotal", value: formatCedis(subtotal) },
  ];
  if (order.appliedDiscount > 0) {
    rows.push({
      label: "Discount",
      value: `-${formatCedis(order.appliedDiscount)}`,
      accent: true,
    });
  }
  if (order.deliveryFee > 0) {
    rows.push({ label: "Delivery", value: formatCedis(order.deliveryFee) });
  }

  const blockHeight = rows.length * 15 + 40;
  let y = startY;
  // A total split across a page break is unacceptable; a total alone at the top
  // of page two is merely ugly.
  if (y + blockHeight > PAGE_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  const panelX = MARGIN + CONTENT_WIDTH - 240;
  doc
    .save()
    .roundedRect(panelX, y - 8, 240, blockHeight, 10)
    .fillColor(TINT)
    .fill()
    .restore();

  for (const row of rows) {
    doc
      .font("body")
      .fontSize(9.5)
      .fillColor(row.accent ? ACCENT : INK_SOFT)
      .text(row.label, panelX + 14, y + 4, { width: 100 });
    doc.text(row.value, panelX + 114, y + 4, { width: 112, align: "right" });
    y += 15;
  }

  y += 6;
  doc
    .save()
    .moveTo(panelX + 14, y)
    .lineTo(panelX + 226, y)
    .lineWidth(0.5)
    .strokeColor(HAIRLINE)
    .stroke()
    .restore();

  doc.font("strong").fontSize(13).fillColor(INK);
  doc.text("Total", panelX + 14, y + 7, { width: 100 });
  doc.text(formatCedis(displayTotal), panelX + 114, y + 7, {
    width: 112,
    align: "right",
  });

  return y + 34;
}

function drawPayments(doc: Doc, order: ReceiptOrder, startY: number): number {
  let y = startY;
  if (y + 70 > PAGE_BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  y = label(doc, "Payment", MARGIN, y);

  if (order.payments.length === 0) {
    doc
      .font("body")
      .fontSize(9.5)
      .fillColor(INK_SOFT)
      .text(`Status: ${statusLabel(order.paymentStatus)}`, MARGIN, y, {
        width: CONTENT_WIDTH,
      });
    y = doc.y + 2;
  } else {
    for (const payment of order.payments) {
      const verified = payment.verifiedAt
        ? ` at ${formatReceiptDateTime(payment.verifiedAt)}`
        : "";
      doc
        .font("body")
        .fontSize(9.5)
        .fillColor(INK_SOFT)
        .text(
          `${clamp(payment.provider, 24)} (${clamp(payment.providerReference, 48)}) — ` +
            `${formatCedis(payment.amount)} — ${statusLabel(payment.status)}${verified}`,
          MARGIN,
          y,
          { width: CONTENT_WIDTH },
        );
      y = doc.y + 2;
    }
  }

  doc
    .font("body")
    .fontSize(9.5)
    .fillColor(INK_SOFT)
    .text(`Order status: ${statusLabel(order.orderStatus)}`, MARGIN, y + 4, {
      width: CONTENT_WIDTH,
    });

  return doc.y;
}

/** Stamped on every page once the content is laid out. */
function drawFooters(doc: Doc): void {
  const range = doc.bufferedPageRange();
  const footerY = PAGE_HEIGHT - MARGIN - 28;

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);

    doc
      .save()
      .moveTo(MARGIN, footerY)
      .lineTo(PAGE_WIDTH - MARGIN, footerY)
      .lineWidth(0.5)
      .strokeColor(HAIRLINE)
      .stroke()
      .restore();

    doc
      .font("strong")
      .fontSize(9)
      .fillColor(INK)
      .text("Thank you for shopping with Baebe Boo.", MARGIN, footerY + 9, {
        width: CONTENT_WIDTH,
        align: "center",
      });

    if (range.count > 1) {
      doc
        .font("body")
        .fontSize(7.5)
        .fillColor(INK_SOFT)
        .text(
          `Page ${index - range.start + 1} of ${range.count}`,
          MARGIN,
          footerY + 9,
          { width: CONTENT_WIDTH, align: "right" },
        );
    }
  }
}
