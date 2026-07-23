import { NextResponse } from "next/server";
import { AdminCatalogError, listInventory } from "@/lib/admin/catalog";
import { inventoryQuerySchema } from "@/lib/admin/catalog-schemas";
import { authorizeAdminApi } from "@/lib/auth";

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("inventory:read");
  if (!authorization.authorized) return authorization.response;

  const url = new URL(request.url);
  const input = inventoryQuerySchema.safeParse({
    shopId: url.searchParams.get("shopId") || undefined,
    productId: url.searchParams.get("productId") || undefined,
    lowStock: url.searchParams.get("lowStock") || undefined,
    limit: url.searchParams.get("limit") || undefined,
  });
  if (!input.success) {
    return NextResponse.json(
      { message: "Invalid inventory filters." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ inventory: await listInventory(input.data) });
  } catch (error) {
    if (error instanceof AdminCatalogError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: "Inventory could not be loaded." },
      { status: 500 },
    );
  }
}
