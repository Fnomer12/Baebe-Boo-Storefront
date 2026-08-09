import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { loadTopBrands } from "@/lib/admin/reports";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("catalog:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const parse = querySchema.safeParse({
    limit: searchParams.get("limit") || undefined,
  });
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid limit." }, { status: 400 });
  }

  try {
    const data = await loadTopBrands(parse.data.limit);
    return NextResponse.json({ brands: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Top brands could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
