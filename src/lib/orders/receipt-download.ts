import "server-only";

import { NextResponse } from "next/server";
import type { ReceiptOrder } from "@/lib/orders/receipt-order";
import { receiptPdfFilename, renderReceiptPdf } from "@/lib/pdf/receipt-pdf";

/**
 * Stream a receipt PDF to whoever has already been authorised to see it.
 *
 * `order` is null when authorisation failed OR when no such order exists, and
 * this deliberately cannot tell the two apart — the public route is reachable
 * with no session, so distinguishing them would turn it into an order-number
 * oracle. Both answer a bare 404, matching the receipt pages.
 */
export async function receiptPdfResponse(order: ReceiptOrder | null): Promise<Response> {
  if (!order) {
    return NextResponse.json({ message: "Receipt not found." }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = await renderReceiptPdf(order);
  } catch (error) {
    // The cause never reaches the browser; it does have to reach the logs, or a
    // receipt that 500s in production is undiagnosable.
    console.error("[receipt/pdf] render failed", {
      orderNumber: order.orderNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "The receipt could not be generated." },
      { status: 500 },
    );
  }

  // A Buffer is a Uint8Array at runtime, but `Buffer -> BodyInit` assignability
  // shifts between @types/node releases. The copy settles it, and costs
  // microseconds on a ~50 KB document.
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptPdfFilename(order.orderNumber)}"`,
      "Content-Length": String(pdf.byteLength),
      // The body carries the customer's name, address, phone and payment
      // references. `private` matters most on the public route, which needs no
      // cookies — this header is the only thing stopping a shared cache from
      // holding one customer's receipt and handing it to the next caller.
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}
