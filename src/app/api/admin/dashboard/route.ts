import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { loadAdminDashboard } from "@/lib/admin/dashboard";

const querySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parse = querySchema.safeParse({
    year: searchParams.get("year") || undefined,
    month: searchParams.get("month") || undefined,
  });
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid year or month." }, { status: 400 });
  }

  try {
    const data = await loadAdminDashboard(parse.data.year, parse.data.month);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
