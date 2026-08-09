import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { loadProfitSummary } from "@/lib/admin/reports";

const querySchema = z.object({
  period: z.enum(["today", "month", "year"]).optional().default("today"),
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parse = querySchema.safeParse({
    period: searchParams.get("period") || undefined,
  });
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid period. Use today, month, or year." }, { status: 400 });
  }

  try {
    const data = await loadProfitSummary(parse.data.period);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profit summary could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
