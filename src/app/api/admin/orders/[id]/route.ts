import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { getAdminOrder } from "@/lib/admin/orders";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const order = await getAdminOrder(id);
  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 });
  }
  return NextResponse.json({ order });
}
