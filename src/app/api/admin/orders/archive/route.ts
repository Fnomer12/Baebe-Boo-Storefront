import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { listAdminCompletedOrders } from "@/lib/admin/orders";

const querySchema = z.object({
  type: z.enum(["all", "online", "instore"]).default("all"),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  search: z.string().max(100).optional(),
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parse = querySchema.safeParse({
    type: searchParams.get("type") || "all",
    year: searchParams.get("year") || undefined,
    month: searchParams.get("month") || undefined,
    search: searchParams.get("search") || undefined,
  });
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid archive filters." }, { status: 400 });
  }

  try {
    const orders = await listAdminCompletedOrders(parse.data);
    return NextResponse.json({ orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
