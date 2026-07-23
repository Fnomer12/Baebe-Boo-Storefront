import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  const customerId = z.uuid().safeParse(id);
  if (!customerId.success) {
    return NextResponse.json(
      { message: "Invalid customer identifier." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("members")
    .delete()
    .eq("id", customerId.data)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { message: "Customer could not be deleted." },
      { status: 409 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { message: "Customer not found." },
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
