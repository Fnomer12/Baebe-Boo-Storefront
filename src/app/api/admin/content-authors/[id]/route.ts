import { NextResponse } from "next/server";
import {
  AdminContentError,
  deleteContentAuthor,
  patchContentAuthor,
} from "@/lib/admin/content";
import { contentAuthorPatchSchema, uuidSchema } from "@/lib/admin/content-schemas";
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
  const input = contentAuthorPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!uuidSchema.safeParse(id).success || !input.success) {
    return NextResponse.json(
      { message: "Invalid content author update." },
      { status: 400 },
    );
  }

  try {
    const author = await patchContentAuthor(id, input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ author });
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
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { message: "Invalid content author identifier." },
      { status: 400 },
    );
  }

  try {
    await deleteContentAuthor(id, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return contentError(error);
  }
}
