import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { counterOrderIdSchema } from "@/lib/counter/counter-schemas";
import { getCounterSaleReceipt } from "@/lib/counter/sales";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  counterReceiptFilename,
  renderCounterReceiptPdf,
} from "@/lib/pdf/counter-receipt-pdf";
import { counterReceiptUrl } from "@/lib/counter/receipt-link";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  visa: "Card",
  momo: "Mobile money",
};

/**
 * 80mm till receipt PDF for the XP-365B in receipt mode.
 *
 * Shop-scoped like the JSON receipt: the sale must belong to the cashier's
 * own shop, and the shop header is read from that same shop row — never from
 * the request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const saleId = counterOrderIdSchema.safeParse(id);
  if (!saleId.success) {
    return NextResponse.json({ message: "Sale not found." }, { status: 404 });
  }

  const { staff } = authorization.counter;
  try {
    const sale = await getCounterSaleReceipt(staff.shop.id, staff.id, saleId.data);
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("name, location")
      .eq("id", staff.shop.id)
      .maybeSingle();

    const pdf = await renderCounterReceiptPdf({
      shopName: (shop?.name as string) || staff.shop.name || "Baebe Boo",
      shopLocation: (shop?.location as string) || staff.shop.location || "",
      orderNumber: sale.orderNumber,
      soldAt: sale.soldAt,
      customerName: sale.customerName,
      paymentLabel: PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod,
      lines: sale.lines.map((line) => ({
        productName: line.productName,
        variantLabel: line.variantLabel,
        quantity: line.quantity,
        price: line.price,
        lineTotal: line.lineTotal,
      })),
      total: sale.total,
      receiptUrl: counterReceiptUrl(sale.orderNumber),
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${counterReceiptFilename(sale.orderNumber)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof CounterError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "The receipt could not be printed." }, { status: 500 });
  }
}
