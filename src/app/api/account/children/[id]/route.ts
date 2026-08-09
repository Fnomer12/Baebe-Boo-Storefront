import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { childMutationSchema } from "@/lib/account/customer-workflows";

type ChildContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: ChildContext) {
  const authorization = await authorizeCustomerMutation(request, "child-update", 12);
  if (!authorization.authorized) return authorization.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid child record." }, { status: 400 });
  }

  const input = childMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the child details and try again." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { error } = await supabase
    .from("customer_children")
    .update({
      first_name: input.data.firstName,
      date_of_birth: input.data.dateOfBirth,
      age_range_taxonomy_id: input.data.ageRangeTaxonomyId,
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ message: "We could not update this child just now." }, { status: 409 });
  }

  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request, context: ChildContext) {
  const authorization = await authorizeCustomerMutation(request, "child-delete", 12);
  if (!authorization.authorized) return authorization.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid child record." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { error } = await supabase
    .from("customer_children")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ message: "We could not remove this child just now." }, { status: 409 });
  }

  return NextResponse.json({ deleted: true });
}
