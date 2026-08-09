import { NextResponse } from "next/server";
import {
  AdminContentError,
  createContentAuthor,
  listContentAuthors,
} from "@/lib/admin/content";
import { contentAuthorCreateSchema } from "@/lib/admin/content-schemas";
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

export async function GET() {
  const authorization = await authorizeAdminApi("content:read");
  if (!authorization.authorized) return authorization.response;

  try {
    const authors = await listContentAuthors();
    return NextResponse.json({ authors });
  } catch (error) {
    return contentError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("content:write");
  if (!authorization.authorized) return authorization.response;

  const input = contentAuthorCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      { message: "Invalid content author details." },
      { status: 400 },
    );
  }

  try {
    const author = await createContentAuthor(input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ author }, { status: 201 });
  } catch (error) {
    return contentError(error);
  }
}
