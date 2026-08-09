import { NextResponse } from "next/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { registryItemSchema } from "@/lib/account/customer-workflows";

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "registry-item-create", 20);
  if (!authorization.authorized) return authorization.response;

  const input = registryItemSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the item details and try again." }, { status: 400 });
  }

  const { supabase, userId } = authorization;
  const registry = await supabase
    .from("gift_registries")
    .select("id")
    .eq("id", input.data.registryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!registry.data) {
    return NextResponse.json({ message: "Registry not found." }, { status: 404 });
  }

  const { error } = await supabase.from("gift_registry_items").insert({
    registry_id: input.data.registryId,
    product_id: input.data.productId,
    variant_id: input.data.variantId,
    requested_quantity: input.data.requestedQuantity,
    priority: input.data.priority,
  });

  if (error) {
    return NextResponse.json({ message: "We could not add this item just now." }, { status: 409 });
  }

  return NextResponse.json({ added: true }, { status: 201 });
}
