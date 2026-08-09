import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { listCounterHandoverOrders } from "@/lib/counter/orders";

export async function GET() {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  try {
    const orders = await listCounterHandoverOrders(authorization.counter.staff.shop.id);
    return NextResponse.json({ orders });
  } catch (error) {
    if (error instanceof CounterError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { message: "Collection orders could not be loaded." },
      { status: 500 },
    );
  }
}
