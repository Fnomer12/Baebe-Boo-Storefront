import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { loadInventoryHealth } from "@/lib/admin/reports";

const querySchema = z.object({
  status: z.enum(["low_stock", "dead_stock", "slow_moving", "healthy"]).optional(),
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("inventory:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parse = querySchema.safeParse({
    status: searchParams.get("status") || undefined,
  });
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid status filter." }, { status: 400 });
  }

  try {
    const data = await loadInventoryHealth(parse.data.status);
    return NextResponse.json({ items: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inventory health could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
