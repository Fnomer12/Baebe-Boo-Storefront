import { NextResponse } from "next/server";
import {
  AdminStoreError,
  createStore,
  listStores,
} from "@/lib/admin/stores";
import { storeCreateSchema } from "@/lib/admin/store-schemas";
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

export async function GET() {
  const authorization = await authorizeAdminApi("stores:read");
  if (!authorization.authorized) return authorization.response;

  try {
    return NextResponse.json({ stores: await listStores() });
  } catch (error) {
    return storeError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("stores:write");
  if (!authorization.authorized) return authorization.response;

  const input = storeCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    // Per-field, not one generic string: "Invalid store details." told an admin
    // nothing about which of five inputs was wrong on a form that rejected the
    // normal case anyway.
    return NextResponse.json(
      {
        message: "Check the highlighted details and try again.",
        errors: fieldErrors(input.error),
      },
      { status: 400 },
    );
  }

  try {
    const store = await createStore(input.data);
    return NextResponse.json({ store }, { status: 201 });
  } catch (error) {
    return storeError(error);
  }
}
