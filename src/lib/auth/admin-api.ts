import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuthorization } from "./authorization";
import {
  hasAdminCapability,
  type AdminCapability,
  type AdminRole,
} from "./admin-capabilities";

type ApiAuthorization =
  | {
      authorized: true;
      admin: NonNullable<Awaited<ReturnType<typeof getAdminAuthorization>>>;
    }
  | { authorized: false; response: NextResponse };

export async function authorizeAdminApi(
  capability: AdminCapability,
): Promise<ApiAuthorization> {
  const admin = await getAdminAuthorization();
  if (!admin) {
    return {
      authorized: false,
      response: NextResponse.json(
        { message: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  if (!hasAdminCapability(admin.role as AdminRole, capability)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { message: "You do not have permission for this action." },
        { status: 403 },
      ),
    };
  }

  return { authorized: true, admin };
}
