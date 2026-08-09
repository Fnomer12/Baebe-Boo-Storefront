import { NextResponse } from "next/server";
import { AdminStoreError, regenerateStaffCode } from "@/lib/admin/stores";
import { staffIdSchema } from "@/lib/admin/store-schemas";
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
    const result = await regenerateStaffCode(staffId.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    // Contains a freshly issued password.
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storeError(error);
  }
}
