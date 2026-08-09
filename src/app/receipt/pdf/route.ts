import { NextResponse } from "next/server";
import { receiptPdfResponse } from "@/lib/orders/receipt-download";
import { authorizeReceiptByEmail } from "@/lib/orders/receipt-order";

/**
 * A guest's receipt, as a PDF, proved by order number plus checkout email.
 *
 * Mirrors `/receipt` exactly — same authorisation function, same refusal. Guest
 * checkout has no account to sign into, so this is the only way those customers
 * reach their own receipt.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const order = url.searchParams.get("order");
  const email = url.searchParams.get("email");

  // Same 404 as a mismatch, so a missing parameter cannot be distinguished
  // from a wrong one.
  if (!order || !email) {
    return NextResponse.json({ message: "Receipt not found." }, { status: 404 });
  }

  return receiptPdfResponse(await authorizeReceiptByEmail(order, email));
}
