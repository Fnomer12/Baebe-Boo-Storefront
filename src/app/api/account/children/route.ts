import { NextResponse } from "next/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { childMutationSchema } from "@/lib/account/customer-workflows";

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "child-create", 12);
  if (!authorization.authorized) return authorization.response;

  const input = childMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the child details and try again." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const { data, error } = await supabase
    .from("customer_children")
    .insert({
      user_id: userId,
      first_name: input.data.firstName,
      date_of_birth: input.data.dateOfBirth,
      age_range_taxonomy_id: input.data.ageRangeTaxonomyId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ message: "We could not add this child just now." }, { status: 409 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
