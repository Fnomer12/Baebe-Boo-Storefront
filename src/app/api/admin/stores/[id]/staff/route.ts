import { NextResponse } from "next/server";
import { AdminStoreError, createStaff } from "@/lib/admin/stores";
import {
  staffCreateSchema,
  storeIdSchema,
} from "@/lib/admin/store-schemas";
import { fieldErrors } from "@/lib/admin/schema-helpers";
import { authorizeAdminApi } from "@/lib/auth";

function storeError(error: unknown) {
  if (error instanceof AdminStoreError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { message: "The staff operation could not be completed." },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const storeId = storeIdSchema.safeParse(id);
  const input = staffCreateSchema.safeParse(
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
    const { store, credentials } = await createStaff(storeId.data, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    // The password is shown once and never stored. Keep it out of every cache
    // between here and the browser.
    return NextResponse.json(
      { store, credentials },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return storeError(error);
  }
}
