import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isoDateTimeSchema, fieldErrors } from "@/lib/admin/schema-helpers";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name.").max(200).optional(),
  scheduled_at: isoDateTimeSchema,
  status: z.enum(["draft", "ready", "cancelled"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", errors: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) {
    return NextResponse.json({ message: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status === "sent") {
    return NextResponse.json(
      { message: "A campaign that has been sent cannot be changed." },
      { status: 409 },
    );
  }

  if (parsed.data.status === "ready" && !parsed.data.scheduled_at) {
    return NextResponse.json(
      {
        message: "Check the highlighted fields.",
        errors: { scheduled_at: "Pick a send date before scheduling this campaign." },
      },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from("campaigns")
    .update({
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.scheduled_at !== undefined ? { scheduled_at: parsed.data.scheduled_at } : {}),
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ message: "Campaign could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ saved: true, id });
}

/**
 * Delete a campaign.
 *
 * There was no delete endpoint at all, and the build flow created a draft row
 * before it checked whether there were any recipients — so every exploratory
 * click left a permanent orphan on the screen with no way to clear it.
 * `campaign_recipients` cascades on the foreign key.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid campaign identifier." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: "Campaign could not be deleted." }, { status: 409 });
  }
  if (!data) {
    return NextResponse.json({ message: "Campaign not found." }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
