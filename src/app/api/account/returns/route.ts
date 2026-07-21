import { NextResponse } from "next/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { returnRequestSchema } from "@/lib/account/customer-workflows";

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "return-request", 4);
  if (!authorization.authorized) return authorization.response;

  const input = returnRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the return details and try again." }, { status: 400 });
  }

  const { data, error } = await authorization.supabase.rpc("request_my_return", {
    p_order_id: input.data.orderId,
    p_reason: input.data.reason,
    p_notes: input.data.notes ?? "",
    p_items: input.data.items.map((item) => ({
      order_item_id: item.orderItemId,
      quantity: item.quantity,
    })),
  });

  if (error || !data) {
    return NextResponse.json(
      { message: "This order or quantity is not eligible for a new return request." },
      { status: 409 },
    );
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
