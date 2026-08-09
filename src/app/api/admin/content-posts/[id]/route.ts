import { NextResponse } from "next/server";
import {
  AdminContentError,
  archiveContentPost,
  patchContentPost,
} from "@/lib/admin/content";
import {
  contentPostPatchSchema,
  productIdSchema,
} from "@/lib/admin/content-schemas";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("content:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const input = contentPostPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!productIdSchema.safeParse(id).success || !input.success) {
    return NextResponse.json(
      { message: "Invalid content post update." },
      { status: 400 },
    );
  }

  try {
    const post = await patchContentPost(id, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ post });
  } catch (error) {
    return contentError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("content:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  if (!productIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { message: "Invalid content post identifier." },
      { status: 400 },
    );
  }

  try {
    const post = await archiveContentPost(id, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ post });
  } catch (error) {
    return contentError(error);
  }
}
