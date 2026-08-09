import { NextResponse } from "next/server";
import {
  AdminContentError,
  createContentPost,
  listContentPosts,
} from "@/lib/admin/content";
import { contentPostCreateSchema } from "@/lib/admin/content-schemas";
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

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("content:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  try {
    const posts = await listContentPosts({ status });
    return NextResponse.json({ posts });
  } catch (error) {
    return contentError(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("content:write");
  if (!authorization.authorized) return authorization.response;

  const input = contentPostCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      { message: "Invalid content post details." },
      { status: 400 },
    );
  }

  try {
    const post = await createContentPost(input.data, {
      userId: authorization.admin.userId,
      role: authorization.admin.role,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return contentError(error);
  }
}
