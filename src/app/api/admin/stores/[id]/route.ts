import { NextResponse } from "next/server";
import {
  AdminStoreError,
  deactivateStore,
  patchStore,
} from "@/lib/admin/stores";
import {
  storeIdSchema,
  storePatchSchema,
} from "@/lib/admin/store-schemas";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";

function storeError(error: unknown) {
  if (error instanceof AdminStoreError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { message: "The store operation could not be completed." },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const storeId = storeIdSchema.safeParse(id);
  const input = storePatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!storeId.success) {
    return NextResponse.json({ message: "Invalid store identifier." }, { status: 400 });
  }
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
    return NextResponse.json({ store: await patchStore(storeId.data, input.data) });
  } catch (error) {
    return storeError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const storeId = storeIdSchema.safeParse(id);
  if (!storeId.success) {
    return NextResponse.json(
      { message: "Invalid store identifier." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ store: await deactivateStore(storeId.data) });
  } catch (error) {
    return storeError(error);
  }
}
