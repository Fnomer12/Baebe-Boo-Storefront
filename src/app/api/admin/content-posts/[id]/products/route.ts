import { NextResponse } from "next/server";
import {
  AdminContentError,
  addContentPostProduct,
  listContentPostProducts,
  removeContentPostProduct,
} from "@/lib/admin/content";
import { contentPostProductSchema, uuidSchema } from "@/lib/admin/content-schemas";
import { authorizeAdminApi } from "@/lib/auth";

function contentError(error: unknown) {
  if (error instanceof AdminContentError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { message: "The content operation could not be completed." },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("content:read");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { message: "Invalid content post identifier." },
      { status: 400 },
    );
  }

  try {
    const products = await listContentPostProducts(id);
    return NextResponse.json({ products });
  } catch (error) {
    return contentError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("content:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const input = contentPostProductSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!uuidSchema.safeParse(id).success || !input.success) {
    return NextResponse.json(
      { message: "Invalid related product details." },
      { status: 400 },
    );
  }

  try {
    await addContentPostProduct(id, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    const products = await listContentPostProducts(id);
    return NextResponse.json({ products }, { status: 201 });
  } catch (error) {
    return contentError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("content:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (!uuidSchema.safeParse(id).success || !productId || !uuidSchema.safeParse(productId).success) {
    return NextResponse.json(
      { message: "Invalid related product identifier." },
      { status: 400 },
    );
  }

  try {
    await removeContentPostProduct(id, productId, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    const products = await listContentPostProducts(id);
    return NextResponse.json({ products });
  } catch (error) {
    return contentError(error);
  }
}
