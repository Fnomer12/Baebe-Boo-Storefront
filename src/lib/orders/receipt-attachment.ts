import "server-only";

import type { EmailAttachment } from "@/lib/email";
import type { ReceiptOrder } from "@/lib/orders/receipt-order";
import { receiptPdfFilename, renderReceiptPdf } from "@/lib/pdf/receipt-pdf";

/**
 * A PDF render that takes longer than this is abandoned. The confirmation runs
 * inside the Paystack verify call and the Paystack webhook, and a webhook that
 * does not answer is retried — which re-runs the whole finalisation path.
 */
export const RECEIPT_PDF_TIMEOUT_MS = 5_000;

/** Well above a real receipt (tens of KB) and far below any provider limit. */
export const RECEIPT_PDF_MAX_BYTES = 8 * 1024 * 1024;

export type ReceiptAttachmentResult =
  | { attachment: EmailAttachment; reason?: undefined }
  | { attachment: null; reason: string };

/**
 * Render the receipt PDF for an email, or explain why there isn't one.
 *
 * NEVER THROWS AND NEVER REJECTS, and that is the entire point of this module.
 * By the time it is called `sendOrderConfirmation` has already claimed the send,
 * and a receipt email with no attachment beats no receipt at all. Returning the
 * failure as a VALUE rather than an exception makes degradation the obvious
 * path instead of the one somebody has to remember to write.
 *
 * The timeout stops us waiting; it cannot cancel the render. That is acceptable
 * only because the renderer is pure JavaScript and synchronous — if it ever
 * grows a subprocess or a browser, that process needs its own deadline.
 */
export async function renderReceiptAttachment(
  order: ReceiptOrder,
  timeoutMs: number = RECEIPT_PDF_TIMEOUT_MS,
): Promise<ReceiptAttachmentResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const pdf = await Promise.race([
      renderReceiptPdf(order),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`receipt-pdf-timeout-after-${timeoutMs}ms`)),
          timeoutMs,
        );
        // pm2 runs a long-lived process; an un-unref'd timer keeps the event
        // loop busy for its full duration after the race is already settled.
        timer.unref?.();
      }),
    ]);

    if (pdf.length > RECEIPT_PDF_MAX_BYTES) {
      return { attachment: null, reason: `receipt-pdf-too-large-${pdf.length}` };
    }

    return {
      attachment: {
        filename: receiptPdfFilename(order.orderNumber),
        content: pdf,
        contentType: "application/pdf",
      },
    };
  } catch (error) {
    return {
      attachment: null,
      reason: error instanceof Error ? error.message : "receipt-pdf-failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
