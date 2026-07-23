import { NextResponse } from "next/server";
import {
  AdminCatalogError,
  createProduct,
  listProducts,
} from "@/lib/admin/catalog";
import { productCreateSchema } from "@/lib/admin/catalog-schemas";
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

export async function GET() {
  const authorization = await authorizeAdminApi("catalog:read");
  if (!authorization.authorized) return authorization.response;

  try {
    return NextResponse.json({ products: await listProducts() });
  } catch (error) {
    return catalogError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("catalog:write");
  if (!authorization.authorized) return authorization.response;

  const input = productCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      { message: "Invalid product details." },
      { status: 400 },
    );
  }

  try {
    const product = await createProduct(input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return catalogError(error);
  }
}
