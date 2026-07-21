import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { addressMutationSchema } from "@/lib/account/customer-workflows";

type AddressContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: AddressContext) {
  const authorization = await authorizeCustomerMutation(request, "address-update", 18);
  if (!authorization.authorized) return authorization.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid address." }, { status: 400 });
  }

  const input = addressMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the address details and try again." }, { status: 400 });
  }

  const { error } = await authorization.supabase.rpc("save_my_address", {
    p_address_id: id,
    p_label: input.data.label ?? "",
    p_recipient_name: input.data.recipientName,
    p_phone: input.data.phone,
    p_address_line_1: input.data.addressLine1,
    p_address_line_2: input.data.addressLine2 ?? "",
    p_city: input.data.city,
    p_region: input.data.region,
    p_digital_address: input.data.digitalAddress ?? "",
    p_delivery_instructions: input.data.deliveryInstructions ?? "",
    p_is_default: input.data.isDefault,
  });

  if (error) {
    return NextResponse.json({ message: "We could not update this address just now." }, { status: 409 });
  }
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request, context: AddressContext) {
  const authorization = await authorizeCustomerMutation(request, "address-delete", 12);
  if (!authorization.authorized) return authorization.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid address." }, { status: 400 });
  }

  const { error } = await authorization.supabase.rpc("delete_my_address", {
    p_address_id: id,
  });
  if (error) {
    return NextResponse.json({ message: "We could not remove this address just now." }, { status: 409 });
  }
  return NextResponse.json({ deleted: true });
}
