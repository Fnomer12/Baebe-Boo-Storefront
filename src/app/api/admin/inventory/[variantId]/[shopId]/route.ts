import { NextResponse } from "next/server";
import {
  AdminCatalogError,
  adjustInventory,
} from "@/lib/admin/catalog";
import {
  inventoryAdjustmentSchema,
  productIdSchema,
} from "@/lib/admin/catalog-schemas";
import { authorizeAdminApi } from "@/lib/auth";

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ variantId: string; shopId: string }> },
) {
  const authorization = await authorizeAdminApi("inventory:write");
  if (!authorization.authorized) return authorization.response;

  const { variantId, shopId } = await params;
  const variant = productIdSchema.safeParse(variantId);
  const shop = productIdSchema.safeParse(shopId);
  const input = inventoryAdjustmentSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!variant.success || !shop.success || !input.success) {
    return NextResponse.json(
      { message: "Invalid inventory adjustment." },
      { status: 400 },
    );
  }

  try {
    const inventory = await adjustInventory(
      variant.data,
      shop.data,
      input.data,
      {
        userId: authorization.admin.userId,
        role: authorization.admin.role,
      },
    );
    return NextResponse.json({ inventory });
  } catch (error) {
    if (error instanceof AdminCatalogError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: "Inventory could not be updated." },
      { status: 500 },
    );
  }
}
