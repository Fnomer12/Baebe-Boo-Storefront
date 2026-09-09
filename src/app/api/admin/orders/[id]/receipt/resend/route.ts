import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { resendOrderReceipt } from "@/lib/orders/order-confirmation";

/**
 * Email a customer their receipt again, on an operator's instruction.
 *
 * Backed by `resendOrderReceipt`, which deliberately skips the once-only claim
 * rather than clearing it. The claim exists to stop the browser and the
 * Paystack webhook both emailing the same customer; an admin pressing this
 * button is asking for precisely the thing that guard prevents, so it gets its
 * own path and the automatic one stays untouched.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const outcome = await resendOrderReceipt(id);

  if (outcome.status === "failed") {
    return NextResponse.json(
      { message: `The receipt could not be sent: ${outcome.reason}` },
      { status: 502 },
    );
  }

  if (outcome.status === "skipped") {
    const message =
      outcome.reason === "no-email"
        ? "This order has no customer email address."
        : "That order could not be found.";
    return NextResponse.json({ message }, { status: 404 });
  }

  // `simulated` and `attachmentFailed` are surfaced rather than flattened into
  // a bare success: "sent, but the mailer is only pretending" and "sent, but
  // without the PDF" are both things an operator needs to be told.
  return NextResponse.json({
    sent: true,
    simulated: outcome.simulated,
    smsSent: outcome.smsSent ?? false,
    smsError: outcome.smsError ?? null,
    attachmentFailed: outcome.attachmentFailed ?? null,
  });
}
