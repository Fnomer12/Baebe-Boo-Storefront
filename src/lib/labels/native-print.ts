import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ShelfLabel } from "@/lib/labels/label-pdf";
import { counterReceiptUrl } from "@/lib/counter/receipt-link";

export type NativePrintResult = {
  printer: string;
  jobId: string;
};

export type NativePrinter = {
  name: string;
  state: string;
  device: string | null;
  enabled: boolean;
  connected: boolean;
};

export type NativePrinterStatus = {
  host: string;
  configuredPrinter: string;
  printers: NativePrinter[];
};

type CommandResult = { stdout: string; stderr: string };

function runCommand(command: string, args: string[], timeoutMs = 5000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timed out.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code !== 0) {
        reject(new Error(result.stderr.trim() || `${command} exited with code ${code ?? "unknown"}.`));
        return;
      }
      resolve(result);
    });
  });
}

function parsePrinters(printerOutput: string, deviceOutput: string): NativePrinter[] {
  const deviceByName = new Map<string, string>();
  for (const line of deviceOutput.split("\n")) {
    const match = line.match(/^device for (.+?):\s*(.+)$/);
    if (match) deviceByName.set(match[1].trim(), match[2].trim());
  }

  return printerOutput
    .split("\n")
    .map((line) => line.match(/^printer (.+?) is (.+?)\.\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const name = match[1].trim();
      const state = match[2].trim();
      const details = match[3].trim();
      const enabled = !details.toLowerCase().includes("disabled");
      const device = deviceByName.get(name) || null;
      return {
        name,
        state,
        device,
        enabled,
        // CUPS only reports a queue as connected when it has a device URI and is enabled.
        connected: Boolean(device) && enabled,
      };
    });
}

export function configuredNativePrinterName(): string {
  return (
    (process.env.LABEL_NATIVE_PRINTER_NAME || process.env.LABEL_PRINTER_NAME || "XPrinter-RAW").trim()
  );
}

export async function getNativePrinterStatus(): Promise<NativePrinterStatus> {
  const [{ stdout: printers }, { stdout: devices }] = await Promise.all([
    runCommand("lpstat", ["-p"]),
    runCommand("lpstat", ["-v"]),
  ]);
  return {
    host: hostname(),
    configuredPrinter: configuredNativePrinterName(),
    printers: parsePrinters(printers, devices),
  };
}

function ascii(value: string, maxLength = 32): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/(["\\])/g, "\\$1")
    .slice(0, maxLength);
}

function tsplText(x: number, y: number, value: string, maxLength = 32, scale = 1): string {
  return `TEXT ${x},${y},"0",0,${scale},${scale},"${ascii(value, maxLength)}"`;
}

function priceText(price: number): string {
  return `GHS ${price.toFixed(2)}`;
}

function wrap(value: string, maxLength: number, maxLines = 2): string[] {
  const words = ascii(value, 120).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function fixedLines(value: string, maxLength: number, maxLines = 2): string[] {
  const clean = ascii(value, maxLength * maxLines);
  const lines: string[] = [];
  for (let index = 0; index < clean.length && lines.length < maxLines; index += maxLength) {
    lines.push(clean.slice(index, index + maxLength));
  }
  return lines;
}

export function buildNativeLabelJob(labels: ShelfLabel[]): Buffer {
  const commands = [
    "SIZE 30 mm,50 mm",
    "GAP 2 mm,0 mm",
    "DENSITY 8",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
  ];

  for (const label of labels) {
    const productLines = wrap(label.productName, 27, 3);
    const variantLines = wrap(label.variantLabel, 27, 1);
    const skuLines = fixedLines(`SKU ${label.sku}`, 27, 2);
    // Keep the QR and its prompt in a bounded header zone. A long product URL
    // can produce a larger QR matrix, so module size 2 keeps it clear of the
    // prompt and leaves a dedicated text area below the separator.
    const productTextY = 158;
    const variantTextY = productTextY + productLines.length * 17 + 2;
    const priceY = variantTextY + variantLines.length * 15 + 6;
    commands.push(
      tsplText(12, 8, label.shopName.toUpperCase(), 27),
      // Keep the QR compact and contained in the upper-left zone. The
      // product copy gets the full label width below it instead of colliding
      // with a QR that spans almost the entire sticker.
      `QRCODE 16,28,L,2,A,0,"${ascii(label.url, 220)}"`,
      tsplText(136, 44, "SCAN QR", 12),
      tsplText(136, 60, "PRODUCT", 12),
      `BAR 12,146,216,1`,
      ...productLines.map((line, index) => tsplText(12, productTextY + index * 17, line, 27)),
      ...variantLines.map((line, index) => tsplText(12, variantTextY + index * 15, line, 27)),
      tsplText(12, priceY, priceText(label.price), 27, 2),
      `BARCODE 12,278,"128",44,0,0,2,2,"${ascii(label.sku, 24)}"`,
      ...skuLines.map((line, index) => tsplText(12, 334 + index * 16, line, 27)),
      "PRINT 1,1",
      "CLS",
    );
  }
  return Buffer.from(`${commands.join("\n")}\n`, "ascii");
}

export function buildNativeCalibrationJob(): Buffer {
  const commands = [
    "SIZE 30 mm,50 mm",
    "GAP 2 mm,0 mm",
    "DENSITY 8",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    `BOX 8,8,232,392,2`,
    `QRCODE 16,28,L,2,A,0,"https://baebe-boo.jtechinnovations.tech/products/calibration-test?sku=TEST-SKU"`,
    tsplText(136, 44, "30 x 50 MM", 12),
    tsplText(136, 64, "STICKER TEST", 12),
    `BAR 12,146,216,1`,
    tsplText(12, 158, "30 x 50 MM TEST", 27),
    `BARCODE 12,250,"128",44,0,0,2,2,"TEST-SKU-123"`,
    tsplText(12, 306, "SKU TEST-SKU-123", 27),
    tsplText(12, 346, "GHS 123.45", 27, 2),
    "PRINT 1,1",
  ];
  return Buffer.from(`${commands.join("\n")}\n`, "ascii");
}

/** Build the counter's 80 x 160 mm receipt-media connection test. */
export function buildNativeReceiptCalibrationJob(): Buffer {
  const commands = [
    "SIZE 80 mm,160 mm",
    "GAP 0 mm,0",
    "DENSITY 8",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    "BOX 16,16,624,1264,2",
    tsplText(48, 56, "BAEBE BOO", 24, 2),
    tsplText(48, 112, "COUNTER RECEIPT TEST", 30),
    tsplText(48, 160, "80 MM RECEIPT", 24, 2),
    tsplText(48, 224, "Receipt mode is connected", 32),
    tsplText(48, 264, "and ready for long receipts.", 32),
    tsplText(48, 352, "GHS 123.45", 24, 2),
    tsplText(48, 416, "Load 80 mm receipt stock", 32),
    tsplText(48, 456, "before printing customer receipts.", 32),
    "PRINT 1,1",
  ];
  return Buffer.from(`${commands.join("\n")}\n`, "ascii");
}

export type NativeReceiptLine = {
  productName: string;
  variantLabel: string;
  quantity: number;
  price: number;
  lineTotal: number;
};

export type NativeReceiptData = {
  shopName: string;
  shopLocation: string;
  orderNumber: string;
  soldAt: string;
  customerName: string;
  paymentLabel: string;
  lines: NativeReceiptLine[];
  total: number;
  receiptUrl?: string;
};

function nativeMoney(value: number): string {
  // The XP-365B's TSPL font is ASCII-only; spell out the currency rather than
  // silently dropping the cedi glyph as an unreadable "GH".
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function nativeReceiptDate(value: string): string {
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

/** Build a long receipt-mode TSPL job for an 80 mm receipt roll. */
export function buildNativeReceiptJob(data: NativeReceiptData): Buffer {
  const receiptWidth = 640;
  const contentLeft = 32;
  const contentWidth = receiptWidth - contentLeft * 2;
  const receiptRight = receiptWidth - contentLeft;
  const commands = ["GAP 0 mm,0", "DENSITY 8", "DIRECTION 1", "REFERENCE 0,0", "CLS"];
  let y = 36;

  // Header: make the extra width feel intentional rather than like a label
  // stretched onto a roll.
  commands.push(
    tsplText(contentLeft, y, data.shopName || "Baebe Boo", 46, 2),
  );
  y += 48;
  if (data.shopLocation) {
    commands.push(tsplText(contentLeft, y, data.shopLocation, 56));
    y += 24;
  }
  commands.push(
    `BAR ${contentLeft},${y},${contentWidth},2`,
    tsplText(contentLeft, y + 20, "IN-STORE RECEIPT", 32, 2),
  );
  y += 64;
  commands.push(
    tsplText(contentLeft, y, `ORDER ${data.orderNumber}`, 56),
  );
  y += 22;
  const soldAt = nativeReceiptDate(data.soldAt);
  if (soldAt) {
    commands.push(tsplText(contentLeft, y, soldAt, 56));
    y += 22;
  }
  commands.push(tsplText(contentLeft, y, data.customerName || "Walk-in Customer", 56));
  y += 34;

  // Item table: name and variant on the left, quantity/unit price and line
  // total on a stable baseline on the right.
  commands.push(
    `BAR ${contentLeft},${y},${contentWidth},2`,
    tsplText(contentLeft, y + 20, "ITEMS", 20, 2),
  );
  y += 62;
  for (const line of data.lines) {
    const nameLines = wrap(line.productName, 48, 4);
    commands.push(...nameLines.map((value) => tsplText(contentLeft, y, value, 48)));
    y += nameLines.length * 22;
    if (line.variantLabel) {
      commands.push(tsplText(contentLeft, y, line.variantLabel, 48));
      y += 22;
    }
    commands.push(
      tsplText(contentLeft, y, `${line.quantity} x ${nativeMoney(line.price)}`, 30),
      tsplText(receiptRight - 136, y, nativeMoney(line.lineTotal), 22),
      `BAR ${contentLeft},${y + 28},${contentWidth},1`,
    );
    y += 48;
  }

  // Summary block.
  commands.push(
    `BAR ${contentLeft},${y},${contentWidth},2`,
    tsplText(contentLeft, y + 24, `PAYMENT  ${data.paymentLabel}`, 36),
    tsplText(contentLeft, y + 58, "TOTAL", 16, 2),
    tsplText(receiptRight - 184, y + 58, nativeMoney(data.total), 28, 2),
  );
  y += 112;

  // Some XP-365B firmware treats `auto` as the last label height seen by the
  // printer. Send an explicit height instead: 100 mm minimum, growing with
  // the receipt so a long item list is still fully printed.
  // Retail receipts have no single fixed length, but a 160 mm minimum gives
  // a normal in-store basket room for the item list, QR, footer and tear-off
  // space without looking like a short label.
  const footerReserve = 470;
  const receiptHeight = Math.max(160, Math.ceil((y + footerReserve) / 8));
  const footerY = receiptHeight * 8 - footerReserve;
  commands.push(
    `BAR ${contentLeft},${footerY},${contentWidth},2`,
    tsplText(contentLeft, footerY + 24, "DIGITAL RECEIPT", 30, 2),
    tsplText(contentLeft, footerY + 66, "Scan to save a copy on your phone", 42),
    `QRCODE 216,${footerY + 98},M,5,A,0,"${ascii(data.receiptUrl || counterReceiptUrl(data.orderNumber), 220)}"`,
    tsplText(198, footerY + 356, "SCAN FOR DIGITAL COPY", 30),
    tsplText(contentLeft, footerY + 398, "Thank you for shopping with Baebe Boo.", 58),
    tsplText(contentLeft, footerY + 424, "Exchanges within 7 days with this receipt.", 58),
    "PRINT 1,1",
  );
  return Buffer.from(`SIZE 80 mm,${receiptHeight} mm\n${commands.join("\n")}\n`, "ascii");
}

/**
 * Send a server-generated PDF to the local CUPS queue.
 *
 * This is intentionally opt-in through LABEL_PRINTER_NAME. The web server
 * must be running on the same laptop as the printer; a deployed server cannot
 * reach a printer connected to an administrator's computer.
 */
export async function printPdfToNativePrinter(pdf: Buffer, title: string): Promise<NativePrintResult> {
  const printer = configuredNativePrinterName();
  if (!printer) {
    throw new Error("Native printing is not configured. Set LABEL_PRINTER_NAME to a CUPS printer.");
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "baebe-boo-print-"));
  const filePath = join(tempDirectory, "label.pdf");
  await writeFile(filePath, pdf);

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        "lp",
        [
          "-d",
          printer,
          "-o",
          "media=w90h144",
          "-o",
          "fit-to-page",
          "-o",
          "job-sheets=none",
          "-t",
          title,
          filePath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", (error) => reject(error));
      child.once("close", (code) => {
        if (code !== 0) {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          reject(new Error(detail || `The printer exited with code ${code ?? "unknown"}.`));
          return;
        }

        const jobId = Buffer.concat(stdout).toString("utf8").trim();
        resolve({ printer, jobId: jobId || "submitted" });
      });
    });
  } finally {
    await unlink(filePath).catch(() => undefined);
    await rmdir(tempDirectory).catch(() => undefined);
  }
}

/** Send printer-language commands directly to the XP-365B RAW USB queue. */
export async function printNativeJob(
  data: Buffer,
  title: string,
  requestedPrinter?: string,
): Promise<NativePrintResult> {
  const printer = (requestedPrinter || configuredNativePrinterName()).trim();
  if (!printer) throw new Error("No printer was selected on the host machine.");
  const tempDirectory = await mkdtemp(join(tmpdir(), "baebe-boo-native-"));
  const filePath = join(tempDirectory, "label.tspl");
  await writeFile(filePath, data);

  try {
    return await new Promise((resolve, reject) => {
      // `raw` is essential here. Without it, CUPS may infer a document format
      // and apply the queue's last label media (30 x 50 mm) before the printer
      // ever sees the TSPL SIZE command for a receipt.
      const child = spawn("lp", ["-d", printer, "-o", "raw", "-o", "job-sheets=none", "-t", title, filePath], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", (error) => reject(error));
      child.once("close", (code) => {
        if (code !== 0) {
          const detail = Buffer.concat(stderr).toString("utf8").trim();
          reject(new Error(detail || `The printer exited with code ${code ?? "unknown"}.`));
          return;
        }
        const jobId = Buffer.concat(stdout).toString("utf8").trim();
        resolve({ printer, jobId: jobId || "submitted" });
      });
    });
  } finally {
    await unlink(filePath).catch(() => undefined);
    await rmdir(tempDirectory).catch(() => undefined);
  }
}
