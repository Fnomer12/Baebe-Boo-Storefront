import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { counterOrderIdSchema } from "@/lib/counter/counter-schemas";
import { getCounterSaleReceipt } from "@/lib/counter/sales";
import { counterReceiptUrl } from "@/lib/counter/receipt-link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildNativeReceiptJob } from "@/lib/labels/native-print";
import { z } from "zod";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  visa: "Card",
  momo: "Mobile money",
};

const requestSchema = z.object({
  transport: z.literal("local"),
  printer: z.string().trim().min(1).max(128),
});

/** Return a counter sale's native receipt payload to the workstation-local connector. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const saleId = counterOrderIdSchema.safeParse(id);
  if (!saleId.success) {
    return NextResponse.json({ message: "Sale not found." }, { status: 404 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Use the local printer connector to print this receipt." }, { status: 400 });
  }

  const verifiedPrinter = (await cookies()).get("baebe_printer_verified")?.value?.trim();
  if (!verifiedPrinter || verifiedPrinter !== parsed.data.printer) {
    return NextResponse.json(
      { message: "Connect the counter printer and complete its test page before printing receipts." },
      { status: 428 },
    );
  }

  const { staff } = authorization.counter;
  try {
    const sale = await getCounterSaleReceipt(staff.shop.id, staff.id, saleId.data);
    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("name, location")
      .eq("id", staff.shop.id)
      .maybeSingle();
    const job = buildNativeReceiptJob({
        shopName: (shop?.name as string) || staff.shop.name || "Baebe Boo",
        shopLocation: (shop?.location as string) || staff.shop.location || "",
        orderNumber: sale.orderNumber,
        soldAt: sale.soldAt,
        customerName: sale.customerName,
        paymentLabel: PAYMENT_LABEL[sale.paymentMethod] || sale.paymentMethod,
        lines: sale.lines,
        total: sale.total,
        receiptUrl: counterReceiptUrl(sale.orderNumber),
      });
    return NextResponse.json({
      printed: false,
      transport: "local-bridge",
      printer: parsed.data.printer,
      title: `Baebe Boo receipt ${sale.orderNumber}`,
      jobBase64: job.toString("base64"),
    });
  } catch (error) {
    if (error instanceof CounterError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "The receipt could not be printed.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
