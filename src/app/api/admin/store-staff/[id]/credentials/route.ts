import { NextResponse } from "next/server";
import { AdminStoreError, resetStaffCredentials } from "@/lib/admin/stores";
import { staffIdSchema } from "@/lib/admin/store-schemas";
import { authorizeAdminApi } from "@/lib/auth";

function storeError(error: unknown) {
  if (error instanceof AdminStoreError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { message: "The counter login could not be updated." },
    { status: 500 },
  );
}

/**
 * Reset a cashier's password — and create their login first if they never had
 * one, so this doubles as the repair action for staff rows created before
 * provisioning existed.
 *
 * POST-only, so it is never prerendered and the response body never lands in a
 * route cache.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const staffId = staffIdSchema.safeParse(id);
  if (!staffId.success) {
    return NextResponse.json({ message: "Invalid staff identifier." }, { status: 400 });
  }

  try {
    const result = await resetStaffCredentials(staffId.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    // Contains a one-time password that is never persisted anywhere.
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return storeError(error);
  }
}
