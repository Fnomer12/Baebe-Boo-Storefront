import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  AdminCatalogError,
  deleteProduct,
  patchProduct,
} from "@/lib/admin/catalog";
import {
  productIdSchema,
  productPatchSchema,
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

export async function PATCH(
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
  const input = productPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      {
        message: "Check the highlighted details and try again.",
        errors: fieldErrors(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const product = await patchProduct(productId.data, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    // The homepage is ISR-cached for five minutes; without this a "Feature on
    // homepage" click (or an archive) looks like it did nothing until the
    // cache turns over.
    revalidatePath("/");
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
    await deleteProduct(productId.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    revalidatePath("/");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return catalogError(error);
  }
}
