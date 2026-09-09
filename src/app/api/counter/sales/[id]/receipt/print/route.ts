import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { counterOrderIdSchema } from "@/lib/counter/counter-schemas";
import { getCounterSaleReceipt } from "@/lib/counter/sales";
import { counterReceiptUrl } from "@/lib/counter/receipt-link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildNativeReceiptJob,
  getNativePrinterStatus,
  printNativeJob,
} from "@/lib/labels/native-print";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  visa: "Card",
  momo: "Mobile money",
};

/** Send a counter sale to the verified host printer without opening a PDF. */
export async function POST(
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

  const verifiedPrinter = (await cookies()).get("baebe_printer_verified")?.value?.trim();
  if (!verifiedPrinter) {
    return NextResponse.json(
      { message: "Connect the counter printer and complete its test page before printing receipts." },
      { status: 428 },
    );
  }

  const { staff } = authorization.counter;
  try {
    const printerStatus = await getNativePrinterStatus();
    const printer = printerStatus.printers.find(
      (candidate) => candidate.name === verifiedPrinter && candidate.connected,
    );
    if (!printer) {
      return NextResponse.json(
        { message: "The verified counter printer is no longer connected. Reconnect it and run the test again." },
        { status: 409 },
      );
    }

    const sale = await getCounterSaleReceipt(staff.shop.id, staff.id, saleId.data);
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("name, location")
      .eq("id", staff.shop.id)
      .maybeSingle();
    const result = await printNativeJob(
      buildNativeReceiptJob({
        shopName: (shop?.name as string) || staff.shop.name || "Baebe Boo",
        shopLocation: (shop?.location as string) || staff.shop.location || "",
        orderNumber: sale.orderNumber,
        soldAt: sale.soldAt,
        customerName: sale.customerName,
        paymentLabel: PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod,
        lines: sale.lines,
        total: sale.total,
        receiptUrl: counterReceiptUrl(sale.orderNumber),
      }),
      `Baebe Boo receipt ${sale.orderNumber}`,
      printer.name,
    );
    return NextResponse.json({ printed: true, host: printerStatus.host, ...result });
  } catch (error) {
    if (error instanceof CounterError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "The receipt could not be printed.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
