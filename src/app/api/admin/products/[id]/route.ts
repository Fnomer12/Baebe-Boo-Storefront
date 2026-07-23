import { NextResponse } from "next/server";
import {
  AdminCatalogError,
  archiveProduct,
  patchProduct,
} from "@/lib/admin/catalog";
import {
  productIdSchema,
  productPatchSchema,
} from "@/lib/admin/catalog-schemas";
import { authorizeAdminApi } from "@/lib/auth";

function catalogError(error: unknown) {
  if (error instanceof AdminCatalogError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { message: "The catalog operation could not be completed." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("catalog:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const productId = productIdSchema.safeParse(id);
  const input = productPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!productId.success || !input.success) {
    return NextResponse.json(
      { message: "Invalid product update." },
      { status: 400 },
    );
  }

  try {
    const product = await patchProduct(productId.data, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return catalogError(error);
  }
}

export async function DELETE(
  _request: Request,
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

  try {
    await archiveProduct(productId.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return catalogError(error);
  }
}
