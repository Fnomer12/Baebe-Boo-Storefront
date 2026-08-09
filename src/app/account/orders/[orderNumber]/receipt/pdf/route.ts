import { receiptPdfResponse } from "@/lib/orders/receipt-download";
import { authorizeReceiptBySession } from "@/lib/orders/receipt-order";

/**
 * The signed-in customer's own receipt, as a PDF.
 *
 * Calls exactly the authorisation function its sibling page calls, and nothing
 * else. Sharing one handler between this and the public route would turn "the
 * download is not weaker than the page" into an argument about a fallback
 * chain; two routes make it a one-line audit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  const { orderNumber } = await params;
  return receiptPdfResponse(await authorizeReceiptBySession(orderNumber));
}
