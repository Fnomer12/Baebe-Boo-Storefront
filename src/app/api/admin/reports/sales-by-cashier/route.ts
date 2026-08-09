import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { loadSalesByCashier } from "@/lib/admin/reports";

export async function GET() {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  try {
    const data = await loadSalesByCashier();
    return NextResponse.json({ cashiers: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sales by cashier could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
