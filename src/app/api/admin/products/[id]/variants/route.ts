import { NextResponse } from "next/server";
import {
  AdminCatalogError,
  replaceProductVariants,
} from "@/lib/admin/catalog";
import {
  productIdSchema,
  productVariantsReplaceSchema,
} from "@/lib/admin/catalog-schemas";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";

function catalogError(error: unknown) {
  if (error instanceof AdminCatalogError) {
    return NextResponse.json(
      { message: error.message, ...(error.errors && { errors: error.errors }) },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { message: "The catalog operation could not be completed." },
    { status: 500 },
  );
}

/**
 * Replace a product's whole option list and variant grid.
 *
 * There is deliberately NO DELETE sibling. A variant is removed by leaving it
 * out of this payload, which the reconciler turns into `is_active = false`.
 * Deleting is not an option the database offers: `purchase_order_items` and
 * `goods_received_note_items` reference variants ON DELETE RESTRICT, so a
 * version that has ever been ordered from a supplier cannot go — and deleting
 * one that could would cascade away the stock the shop physically has.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("catalog:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const productId = productIdSchema.safeParse(id);
  if (!productId.success) {
    return NextResponse.json(
      { message: "Invalid product identifier." },
      { status: 400 },
    );
  }

  const input = productVariantsReplaceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    // Attached to the specific row and field: a twelve-row grid answered with
    // one generic string leaves a shop owner hunting for the bad cell.
    return NextResponse.json(
      {
        message: "Check the highlighted versions and try again.",
        errors: fieldErrors(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const product = await replaceProductVariants(productId.data, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return catalogError(error);
  }
}
