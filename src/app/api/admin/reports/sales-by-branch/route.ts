import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { loadSalesByBranch } from "@/lib/admin/reports";

export async function GET() {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  try {
    const data = await loadSalesByBranch();
    return NextResponse.json({ branches: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sales by branch could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
