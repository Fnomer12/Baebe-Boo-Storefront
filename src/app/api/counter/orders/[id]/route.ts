import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { collectCounterOrder, getCounterHandoverOrder } from "@/lib/counter/orders";
import { counterOrderIdSchema } from "@/lib/counter/counter-schemas";

function counterError(error: unknown, fallback: string) {
  if (error instanceof CounterError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const orderId = counterOrderIdSchema.safeParse(id);
  if (!orderId.success) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  try {
    const order = await getCounterHandoverOrder(
      authorization.counter.staff.shop.id,
      orderId.data,
    );
    return NextResponse.json({ order });
  } catch (error) {
    return counterError(error, "The order could not be loaded.");
  }
}

/** Hand the order to the customer standing at the counter. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const orderId = counterOrderIdSchema.safeParse(id);
  if (!orderId.success) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }

  try {
    const order = await collectCounterOrder(
      authorization.counter.staff.shop.id,
      orderId.data,
    );
    return NextResponse.json({ order });
  } catch (error) {
    return counterError(error, "The order could not be handed over.");
  }
}
