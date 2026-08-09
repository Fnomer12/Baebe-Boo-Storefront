import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  AdminCatalogError,
  createProduct,
  listProducts,
} from "@/lib/admin/catalog";
import { productCreateSchema } from "@/lib/admin/catalog-schemas";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";
import { parseProductStatusFilter } from "@/domain/admin-products";

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

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("catalog:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? undefined;
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("pageSize") || "24");

  try {
    const { products, total } = await listProducts({
      query,
      // The workspace sends the word on its dropdown — `all | active | archived`
      // — which this route used to understand only half of. Paging is done by
      // Postgres now, so an ignored filter is not a cosmetic miss: it returns
      // page one of the whole catalogue under the heading "Archived".
      status: parseProductStatusFilter(searchParams.get("status")),
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 24,
    });
    return NextResponse.json({ products, total });
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
    // Per-input, not one generic string: a twelve-field form plus a variant
    // grid answered with "Invalid product details." tells a shop owner nothing.
    return NextResponse.json(
      {
        message: "Check the highlighted details and try again.",
        errors: fieldErrors(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const product = await createProduct(input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    revalidatePath("/");
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return catalogError(error);
  }
}
