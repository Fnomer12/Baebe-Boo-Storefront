import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { sendOrderConfirmation } from "@/lib/orders/order-confirmation";

/**
 * Re-run the exactly-once confirmation for a stranded paid order.
 *
 * Unlike the receipt resend (which bypasses the claim and always sends),
 * this goes through `sendOrderConfirmation`, so a verify-vs-webhook race
 * cannot double-send: the conditional UPDATE decides the winner. Use it
 * when `confirmation_email_sent_at` / `confirmation_sms_sent_at` are still
 * null on a paid order.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const outcome = await sendOrderConfirmation(id);

  if (outcome.status === "failed") {
    return NextResponse.json(
      { message: `The confirmation could not be sent: ${outcome.reason}` },
      { status: 502 },
    );
  }

  if (outcome.status === "skipped") {
    const message =
      outcome.reason === "no-email"
        ? "This order has no customer email or phone."
        : outcome.reason === "order-missing"
          ? "That order could not be found."
          : "This order was already confirmed.";
    return NextResponse.json({ message, reason: outcome.reason }, { status: 409 });
  }

  return NextResponse.json({
    sent: true,
    simulated: outcome.simulated,
    smsSent: outcome.smsSent ?? false,
    smsError: outcome.smsError ?? null,
    attachmentFailed: outcome.attachmentFailed ?? null,
  });
}
