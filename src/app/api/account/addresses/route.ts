import { NextResponse } from "next/server";
import { addressMutationSchema } from "@/lib/account/customer-workflows";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "address-create", 12);
  if (!authorization.authorized) return authorization.response;

  const input = addressMutationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the address details and try again." }, { status: 400 });
  }

  const { data, error } = await authorization.supabase.rpc("save_my_address", {
    p_address_id: null,
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

  if (error || !data) {
    return NextResponse.json({ message: "We could not save this address just now." }, { status: 409 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
