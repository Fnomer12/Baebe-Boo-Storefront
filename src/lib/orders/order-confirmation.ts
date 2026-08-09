import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { postPurchaseTemplate, publicReceiptUrl } from "@/lib/email/templates";
import { renderReceiptAttachment } from "@/lib/orders/receipt-attachment";
import { loadReceiptOrderById, receiptTotals } from "@/lib/orders/receipt-order";
import type { PostPurchaseOrder } from "@/lib/email/templates";
import type { ReceiptOrder } from "@/lib/orders/receipt-order";

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  total_amount: number | string | null;
  delivery_address: string | null;
  confirmation_email_sent_at: string | null;
};

export type ConfirmationOutcome =
  | {
      status: "sent";
      simulated: boolean;
      /** Present only when the receipt went out without its PDF. */
      attachmentFailed?: string;
    }
  | { status: "skipped"; reason: "already-sent" | "no-email" | "order-missing" }
  | { status: "failed"; reason: string };

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string };
  return (
    row.code === "42703" ||
    row.code === "PGRST204" ||
    row.message?.toLowerCase().includes("confirmation_email_sent_at") === true
  );
}

/**
 * Hand the claim back, so a retry or a manual replay can send.
 *
 * Compare-and-set on the exact timestamp this call wrote, so it can never
 * clobber a claim somebody else made in the meantime. Swallows its own errors:
 * it runs inside a `finally`, and throwing from there would replace the real
 * failure with a database one.
 */
async function releaseClaim(orderId: string, claimedAt: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ confirmation_email_sent_at: null })
      .eq("id", orderId)
      .eq("confirmation_email_sent_at", claimedAt);
    if (error) {
      // A failed release IS the permanently-stranded state, so it must not be
      // silent: the order now reads as receipted with no email ever sent.
      console.error("sendOrderConfirmation: could not release the send claim", {
        orderId,
        error: error.message,
      });
    }
  } catch (error) {
    console.error("sendOrderConfirmation: could not release the send claim", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Turn the full receipt into what the email template wants. */
function postPurchaseFrom(
  receipt: ReceiptOrder,
  options: { attachedPdf: boolean },
): PostPurchaseOrder {
  const { subtotal, displayTotal } = receiptTotals(receipt);
  return {
    orderNumber: receipt.orderNumber,
    customerName: receipt.customerName ?? undefined,
    items: receipt.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.totalPrice,
    })),
    subtotal,
    discount: receipt.appliedDiscount,
    deliveryFee: receipt.deliveryFee,
    total: displayTotal,
    fulfilment: fulfilmentLine(receipt.deliveryAddress),
    receiptUrl: receipt.customerEmail
      ? publicReceiptUrl(receipt.orderNumber, receipt.customerEmail)
      : undefined,
    hasReceiptAttachment: options.attachedPdf,
  };
}

/**
 * Email the customer their receipt, exactly once, with a PDF attached.
 *
 * `finalizeVerifiedOrder` is reached from both /api/paystack/verify (browser)
 * and /api/paystack/webhook (Paystack) for the same payment. Reading
 * `confirmation_email_sent_at` and then writing it would be a check-then-act
 * race that sends two receipts, so the claim is a single conditional UPDATE
 * and the row count decides the winner.
 *
 * Never throws. A receipt is not worth failing a paid order over — the caller
 * treats the outcome as advisory.
 */
export async function sendOrderConfirmation(
  orderId: string,
): Promise<ConfirmationOutcome> {
  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, total_amount, delivery_address, confirmation_email_sent_at",
      )
      .eq("id", orderId)
      .maybeSingle();

    // The column arrives with 20260730_order_confirmation_email.sql. Without it
    // there is no way to claim the send safely, and sending anyway would mean a
    // duplicate receipt on every webhook retry. Staying silent is the better
    // failure.
    if (error && isMissingColumnError(error)) {
      return { status: "failed", reason: "confirmation-column-missing" };
    }
    if (error) return { status: "failed", reason: "order-lookup-failed" };

    const order = data as unknown as OrderRow | null;
    if (!order) return { status: "skipped", reason: "order-missing" };
    if (order.confirmation_email_sent_at) {
      return { status: "skipped", reason: "already-sent" };
    }

    // Both of these must stay BEFORE the claim. An order with no email address
    // would otherwise be marked as receipted for ever without one being sent.
    const recipient = (order.customer_email || "").trim();
    if (!recipient) return { status: "skipped", reason: "no-email" };

    // Claim before sending. Whoever flips null -> timestamp owns the send;
    // the loser's update matches zero rows and backs off.
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("orders")
      .update({ confirmation_email_sent_at: claimedAt })
      .eq("id", orderId)
      .is("confirmation_email_sent_at", null)
      .select("id");

    if (claimError) return { status: "failed", reason: "claim-failed" };
    if (!claimed || claimed.length === 0) {
      return { status: "skipped", reason: "already-sent" };
    }

    // ---- everything past this point owns a claim it must hand back ----
    //
    // THE BUG THIS STRUCTURE FIXES: the release used to fire only when
    // `sendEmail` reported failure. Anything that threw between the claim and
    // the send — a failed load, a template error, a PDF bug — left the order
    // permanently marked as receipted with no email ever sent, and nothing ever
    // retries a webhook that already answered 200. Ordering the steps
    // defensively would only protect the step you thought of; a `finally`
    // protects every one, including whatever gets added next year.
    let sent = false;
    try {
      // Richer than the row above: unit prices, discounts, delivery and the
      // shop, which is what the PDF and the itemised email both need.
      const receipt = await loadReceiptOrderById(orderId).catch(() => null);

      const pdf = receipt
        ? await renderReceiptAttachment(receipt)
        : ({ attachment: null, reason: "receipt-data-unavailable" } as const);

      // A degraded load still produces the receipt the customer used to get,
      // built from the row the claim already read.
      const template = postPurchaseTemplate(
        receipt
          ? postPurchaseFrom(receipt, { attachedPdf: Boolean(pdf.attachment) })
          : {
              orderNumber: order.order_number || undefined,
              customerName: order.customer_name || undefined,
              total: Number(order.total_amount || 0),
              fulfilment: fulfilmentLine(order.delivery_address),
              receiptUrl: order.order_number
                ? publicReceiptUrl(order.order_number, recipient)
                : undefined,
            },
      );

      const result = await sendEmail(recipient, template.subject, template.html, {
        ...(pdf.attachment ? { attachments: [pdf.attachment] } : {}),
      });

      if (!result.sent) {
        return { status: "failed", reason: result.error };
      }

      sent = true;
      return {
        status: "sent",
        simulated: Boolean(result.simulated),
        ...(pdf.reason ? { attachmentFailed: pdf.reason } : {}),
      };
    } finally {
      if (!sent) await releaseClaim(orderId, claimedAt);
    }
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "unknown-error",
    };
  }
}

/**
 * Re-send a receipt on an operator's instruction.
 *
 * Deliberately a separate function that never touches the claim. The
 * exactly-once path above exists to stop the browser and the webhook both
 * emailing a customer; an admin pressing "resend" is asking for exactly the
 * thing that guard prevents. Implementing this by nulling the column and
 * re-running `sendOrderConfirmation` would reopen that race for everyone.
 */
export async function resendOrderReceipt(orderId: string): Promise<ConfirmationOutcome> {
  try {
    const receipt = await loadReceiptOrderById(orderId).catch(() => null);
    if (!receipt) return { status: "skipped", reason: "order-missing" };

    const recipient = (receipt.customerEmail || "").trim();
    if (!recipient) return { status: "skipped", reason: "no-email" };

    const pdf = await renderReceiptAttachment(receipt);
    const template = postPurchaseTemplate(
      postPurchaseFrom(receipt, { attachedPdf: Boolean(pdf.attachment) }),
    );

    const result = await sendEmail(recipient, template.subject, template.html, {
      ...(pdf.attachment ? { attachments: [pdf.attachment] } : {}),
    });

    if (!result.sent) return { status: "failed", reason: result.error };

    // Stamped unconditionally: the customer has now been emailed, whatever the
    // column said before. A failure to record that is not worth failing the
    // send the operator can see already happened.
    await supabaseAdmin
      .from("orders")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);

    return {
      status: "sent",
      simulated: Boolean(result.simulated),
      ...(pdf.reason ? { attachmentFailed: pdf.reason } : {}),
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "unknown-error",
    };
  }
}

function fulfilmentLine(deliveryAddress: string | null): string | undefined {
  const address = (deliveryAddress || "").trim();
  if (!address) return undefined;
  if (address === "Click-and-collect") {
    return "Collection: we will let you know as soon as your order is ready to pick up in store.";
  }
  return `Delivering to: ${address}`;
}
