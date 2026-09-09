import "server-only";

import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import { formatCedis } from "@/domain/money";
import { loadReceiptAssets } from "@/lib/pdf/receipt-assets";

/**
 * Till receipt for the XP-365B in receipt mode (continuous 80mm roll).
 *
 * Content is 74mm wide — inside an 80mm roll with room for the driver's own
 * margins. Length is exact: the layout is measured first on a
 * scratch document, then rendered onto a page of precisely that height, so
 * the cutter lands right under the footer instead of feeding blank paper.
 *
 * Drawn with the same vendored Jakarta fonts as the online receipt: the cedi
 * sign has no glyph in PDFKit's built-in Helvetica, and a total rendered as
 * "GH 360.75" on a customer's receipt is a defect, not a cosmetic choice.
 */

const CONTENT_WIDTH_MM = 74;
const MM_TO_PT = 25.4 / 72;
const CONTENT_WIDTH = CONTENT_WIDTH_MM / MM_TO_PT;
// Whole page is 80mm. Content is 74mm + 3mm margins each side so the
// receipt stays readable on the larger continuous roll.
const PAGE_WIDTH = 80 / MM_TO_PT;
const MARGIN = 3 / MM_TO_PT;

export type CounterReceiptLine = {
  productName: string;
  variantLabel: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

export type CounterReceiptData = {
  shopName: string;
  shopLocation: string;
  orderNumber: string;
  soldAt: string;
  customerName: string;
  paymentLabel: string;
  lines: CounterReceiptLine[];
  total: number;
  receiptUrl?: string;
};

async function qrPng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "qrcode",
    text,
    eclevel: "M",
    scale: 4,
    includetext: false,
  });
}

export function counterReceiptFilename(orderNumber: string): string {
  const safe = orderNumber.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
  return `baebe-boo-receipt-${safe}.pdf`;
}

function formatSoldAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GH", {
    timeZone: "Africa/Accra",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

type MeasuredBlock =
  | { kind: "text"; text: string; size: number; bold: boolean; align: "left" | "center"; color: string; maxLines?: number }
  | { kind: "rule" }
  | { kind: "gap"; height: number }
  | { kind: "spacer" }
  | { kind: "line"; name: string; variant: string; qtyLine: string; total: string }
  | { kind: "qr"; url: string };

function plan(data: CounterReceiptData): MeasuredBlock[] {
  const blocks: MeasuredBlock[] = [
    { kind: "text", text: data.shopName || "Baebe Boo", size: 12, bold: true, align: "center", color: "#111111" },
  ];
  if (data.shopLocation) {
    blocks.push({ kind: "text", text: data.shopLocation, size: 8, bold: false, align: "center", color: "#555555" });
  }
  blocks.push(
    { kind: "gap", height: 8 },
    { kind: "rule" },
    { kind: "gap", height: 8 },
    { kind: "text", text: "IN-STORE RECEIPT", size: 10, bold: true, align: "center", color: "#111111" },
    { kind: "gap", height: 6 },
    { kind: "text", text: `Order ${data.orderNumber}`, size: 9, bold: true, align: "left", color: "#111111" },
  );
  const soldAt = formatSoldAt(data.soldAt);
  if (soldAt) blocks.push({ kind: "text", text: soldAt, size: 8, bold: false, align: "left", color: "#555555" });
  blocks.push({ kind: "text", text: data.customerName || "Walk-in Customer", size: 8, bold: false, align: "left", color: "#555555" });
  blocks.push(
    { kind: "gap", height: 8 },
    { kind: "rule" },
    { kind: "gap", height: 8 },
    { kind: "text", text: "ITEMS", size: 10, bold: true, align: "left", color: "#111111" },
    { kind: "gap", height: 4 },
  );
  for (const line of data.lines) {
    blocks.push({
      kind: "line",
      name: line.productName,
      variant: line.variantLabel,
      qtyLine: `${line.quantity} × ${formatCedis(line.price)}`,
      total: formatCedis(line.lineTotal),
    });
  }
  blocks.push(
    { kind: "gap", height: 6 },
    { kind: "rule" },
    { kind: "gap", height: 6 },
    { kind: "text", text: `Payment  ${data.paymentLabel}`, size: 9, bold: false, align: "left", color: "#555555" },
    { kind: "text", text: `TOTAL  ${formatCedis(data.total)}`, size: 14, bold: true, align: "left", color: "#111111" },
  );
  blocks.push(
    { kind: "gap", height: 10 },
    { kind: "spacer" },
    { kind: "text", text: "DIGITAL RECEIPT", size: 9, bold: true, align: "center", color: "#111111" },
  );
  if (data.receiptUrl) {
    blocks.push(
      { kind: "gap", height: 4 },
      { kind: "qr", url: data.receiptUrl },
      { kind: "text", text: "Scan to save a copy on your phone", size: 8, bold: false, align: "center", color: "#111111" },
    );
  }
  blocks.push(
    { kind: "gap", height: 8 },
    { kind: "text", text: "Thank you for shopping with Baebe Boo.", size: 8, bold: false, align: "center", color: "#111111" },
    { kind: "text", text: "Exchanges within 7 days with this receipt.", size: 7.5, bold: false, align: "center", color: "#555555" },
  );
  return blocks;
}

function measure(blocks: MeasuredBlock[]): number {
  // Metrics only — never collected or returned.
  const probe = new PDFDocument({ size: [PAGE_WIDTH, 2000], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  const assets = loadReceiptAssets();
  probe.registerFont("regular", assets.regular);
  probe.registerFont("bold", assets.bold);
  let height = MARGIN;
  for (const block of blocks) {
    if (block.kind === "gap") {
      height += block.height;
    } else if (block.kind === "spacer") {
      // Filled at render time when the receipt is shorter than the 160 mm
      // minimum. This keeps the QR/footer in the lower section of the roll.
      continue;
    } else if (block.kind === "rule") {
      height += 1 + 2;
    } else if (block.kind === "line") {
      probe.font("bold").fontSize(9);
      const nameHeight = probe.heightOfString(block.name, { width: CONTENT_WIDTH });
      height += Math.min(nameHeight, 9 * 1.15 * 2);
      if (block.variant) height += 7.5 * 1.15;
      height += 8.5 * 1.15 + 5;
    } else if (block.kind === "qr") {
      height += 24 / MM_TO_PT + 4;
    } else {
      probe.font(block.bold ? "bold" : "regular").fontSize(block.size);
      const lines = block.maxLines ?? 99;
      height += Math.min(probe.heightOfString(block.text, { width: CONTENT_WIDTH }), block.size * 1.15 * lines);
    }
  }
  probe.end();
  return height + MARGIN;
}

export async function renderCounterReceiptPdf(data: CounterReceiptData): Promise<Buffer> {
  if (data.lines.length === 0) throw new Error("A receipt needs at least one line.");
  const assets = loadReceiptAssets();
  const blocks = plan(data);
  const pageHeight = Math.max(160 / MM_TO_PT, measure(blocks));

  const doc = new PDFDocument({
    size: [PAGE_WIDTH, pageHeight],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: { Title: `Receipt ${data.orderNumber}`, Creator: "Baebe Boo" },
  });
  doc.registerFont("regular", assets.regular);
  doc.registerFont("bold", assets.bold);

  let cursor = MARGIN;
  const drawRule = () => {
    doc.moveTo(MARGIN, cursor).lineTo(MARGIN + CONTENT_WIDTH, cursor).lineWidth(0.75).dash(3, { space: 2 }).stroke("#999999").undash();
    cursor += 3;
  };

  for (const block of blocks) {
    if (block.kind === "gap") {
      cursor += block.height;
    } else if (block.kind === "spacer") {
      const footerReserve = data.receiptUrl ? 52 / MM_TO_PT : 27 / MM_TO_PT;
      cursor += Math.max(0, pageHeight - MARGIN - footerReserve - cursor);
    } else if (block.kind === "rule") {
      drawRule();
    } else if (block.kind === "line") {
      const nameHeight = Math.min(
        doc.font("bold").fontSize(9).heightOfString(block.name, { width: CONTENT_WIDTH }),
        9 * 1.15 * 2,
      );
      doc.font("bold").fontSize(9).fillColor("#111111");
      doc.text(block.name, MARGIN, cursor, { width: CONTENT_WIDTH, height: 9 * 1.15 * 2, ellipsis: true });
      cursor += nameHeight;
      if (block.variant) {
        doc.font("regular").fontSize(7.5).fillColor("#555555");
        doc.text(block.variant, MARGIN, cursor, { width: CONTENT_WIDTH, lineBreak: false, ellipsis: true });
        cursor += 7.5 * 1.15;
      }
      doc.font("regular").fontSize(8.5).fillColor("#111111");
      doc.text(block.qtyLine, MARGIN, cursor, { width: CONTENT_WIDTH - 70, lineBreak: false });
      doc.font("bold").fontSize(9);
      doc.text(block.total, MARGIN, cursor, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
      cursor += 8.5 * 1.15 + 5;
    } else if (block.kind === "qr") {
      const qr = await qrPng(block.url);
      const qrSize = 24 / MM_TO_PT;
      doc.image(qr, MARGIN + (CONTENT_WIDTH - qrSize) / 2, cursor, {
        width: qrSize,
        height: qrSize,
      });
      cursor += qrSize + 4;
    } else {
      doc.font(block.bold ? "bold" : "regular").fontSize(block.size).fillColor(block.color);
      const options: { width: number; align: "left" | "center"; lineBreak?: boolean; ellipsis?: boolean } =
        block.align === "center"
          ? { width: CONTENT_WIDTH, align: "center", lineBreak: false, ellipsis: true }
          : { width: CONTENT_WIDTH, align: "left", ellipsis: true };
      const atX = block.align === "center" ? MARGIN : MARGIN;
      doc.text(block.text, atX, cursor, options);
      cursor += doc.heightOfString(block.text, { width: CONTENT_WIDTH });
    }
  }

  return collect(doc);
}
