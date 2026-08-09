import { NextResponse } from "next/server";
import {
  AdminStoreError,
  deleteStaff,
  patchStaff,
} from "@/lib/admin/stores";
import {
  staffIdSchema,
  staffPatchSchema,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const staffId = staffIdSchema.safeParse(id);
  const input = staffPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!staffId.success) {
    return NextResponse.json({ message: "Invalid staff identifier." }, { status: 400 });
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
    return NextResponse.json({ store: await patchStaff(staffId.data, input.data) });
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
  const staffId = staffIdSchema.safeParse(id);
  if (!staffId.success) {
    return NextResponse.json(
      { message: "Invalid staff identifier." },
      { status: 400 },
    );
  }

  try {
    const store = await deleteStaff(staffId.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ store });
  } catch (error) {
    return storeError(error);
  }
}
