import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { getCounterSaleReceipt } from "@/lib/counter/sales";
import { counterOrderIdSchema } from "@/lib/counter/counter-schemas";

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
    return NextResponse.json({ sale });
  } catch (error) {
    if (error instanceof CounterError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "The receipt could not be loaded." }, { status: 500 });
  }
}
