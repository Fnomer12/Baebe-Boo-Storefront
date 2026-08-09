import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { blankToUndefined, fieldErrors } from "@/lib/admin/schema-helpers";
import { resolveCustomer } from "../_customer-record";

const childSchema = z.object({
  id: blankToUndefined(z.uuid()),
  firstName: z.string().trim().min(1, "Give the child a name.").max(80),
  dateOfBirth: blankToUndefined(z.iso.date("Use a date like 2022-08-05.")),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the parent's name.").max(120),
  phone: blankToUndefined(z.string().trim().min(7, "A phone number needs at least 7 digits.").max(24)),
  dateOfBirth: blankToUndefined(z.iso.date("Use a date like 1990-04-23.")),
  marketingStatus: z.enum(["unknown", "subscribed", "unsubscribed"]),
  children: z.array(childSchema).max(12, "Twelve children is the most this form holds.").optional(),
});

/**
 * Edit a customer.
 *
 * There was no edit at all before: a typo in a parent's name or a wrong
 * birthday could only be fixed with SQL. Writes land on `customer_profiles` and
 * `customer_children` — the source of truth — and fall back to the `members`
 * row for a lead that has no account yet.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid customer identifier." }, { status: 400 });
  }

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

  const customer = await resolveCustomer(id);
  if (!customer) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 });
  }

  if (customer.userId) {
    const { error } = await supabaseAdmin
      .from("customer_profiles")
      .update({
        full_name: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
        date_of_birth: parsed.data.dateOfBirth ?? null,
        marketing_status: parsed.data.marketingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", customer.userId);
    if (error) {
      return NextResponse.json({ message: "The customer could not be saved." }, { status: 500 });
    }

    if (parsed.data.children) {
      const childError = await reconcileChildren(customer.userId, parsed.data.children);
      if (childError) {
        return NextResponse.json(
          { message: "The customer was saved but their children could not be updated." },
          { status: 500 },
        );
      }
    }
  } else {
    /**
     * A lead with no account. Everything it holds lives on the members row, so
     * that is where the edit goes; the backfill carries it across later.
     *
     * A members row has no marketing status and no parent date of birth —
     * those columns only exist on `customer_profiles`, which cannot exist
     * without an `auth.users` row to hang off. This branch used to accept both,
     * write neither and answer `saved: true`, so an admin could set a family to
     * "Unsubscribed", be told it saved, reopen the record and find them
     * subscribable again. Refusing with the reason attached to the offending
     * field is the honest answer: nothing is dropped, and the message says what
     * to do about it.
     */
    const unsettable: Record<string, string> = {};
    if (parsed.data.marketingStatus !== "unknown") {
      unsettable.marketingStatus =
        "This family has never signed in, so there is no account to record a marketing preference on. Leave it as “Not asked” to save the rest.";
    }
    if (parsed.data.dateOfBirth) {
      unsettable.dateOfBirth =
        "This family has never signed in, so there is nowhere to keep the parent's own birthday yet. Clear it to save the rest — the children's birthdays below are stored either way.";
    }
    if (Object.keys(unsettable).length > 0) {
      return NextResponse.json(
        { message: "Check the highlighted fields.", errors: unsettable },
        { status: 400 },
      );
    }

    // A members row holds exactly one child, so only the first is written. The
    // form says so before the admin submits — see the lead notice in
    // `CustomerManagement`. Once the family signs in, `customer_children` takes
    // all of them.
    const child = parsed.data.children?.[0];
    const { error } = await supabaseAdmin
      .from("members")
      .update({
        parent_name: parsed.data.fullName,
        phone: parsed.data.phone ?? "",
        ...(child
          ? {
              child_first_name: child.firstName,
              ...(child.dateOfBirth ? { child_date_of_birth: child.dateOfBirth } : {}),
            }
          : {}),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ message: "The customer could not be saved." }, { status: 500 });
    }
  }

  return NextResponse.json({ saved: true, id, hasAccount: Boolean(customer.userId) });
}

/**
 * Delete a customer, all of them.
 *
 * This used to remove the `members` row and stop, leaving the auth user, the
 * profile, the orders, the points and the saved addresses behind — so the
 * customer vanished from admin and carried on being able to sign in and shop.
 * Deleting the auth user cascades to `customer_profiles`, `customer_children`,
 * `reward_accounts` and `customer_addresses`; their orders survive with
 * `customer_user_id` set to null, which is deliberate. Deleting somebody's
 * account must not delete the shop's sales history.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ message: "Invalid customer identifier." }, { status: 400 });
  }

  const customer = await resolveCustomer(id);
  if (!customer) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 });
  }

  const memberIds = customer.members.map((member) => member.id);
  if (memberIds.length > 0) {
    const { error } = await supabaseAdmin.from("members").delete().in("id", memberIds);
    if (error) {
      return NextResponse.json({ message: "Customer could not be deleted." }, { status: 409 });
    }
  }

  if (customer.userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(customer.userId);
    if (error) {
      return NextResponse.json(
        {
          message:
            "Their family record was removed but the sign-in account could not be deleted, so they can still log in. Try again.",
        },
        { status: 409 },
      );
    }
  }

  return new NextResponse(null, { status: 204 });
}

type ChildInput = { id?: string; firstName: string; dateOfBirth?: string };

/**
 * Make `customer_children` match what the admin submitted.
 *
 * Children are addressed by id, so renaming one is a rename rather than a
 * delete-and-recreate — recreating would give the child a new row and lose
 * whatever the campaign already recorded against the old one.
 */
async function reconcileChildren(userId: string, children: ChildInput[]): Promise<Error | null> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("customer_children")
    .select("id")
    .eq("user_id", userId);
  if (readError) return new Error(readError.message);

  const keptIds = new Set(children.map((child) => child.id).filter(Boolean) as string[]);
  const removed = (existing || []).map((row) => row.id).filter((rowId) => !keptIds.has(rowId));

  if (removed.length > 0) {
    const { error } = await supabaseAdmin.from("customer_children").delete().in("id", removed);
    if (error) return new Error(error.message);
  }

  for (const child of children) {
    const values = {
      user_id: userId,
      first_name: child.firstName,
      date_of_birth: child.dateOfBirth ?? null,
    };
    const { error } = child.id
      ? await supabaseAdmin.from("customer_children").update(values).eq("id", child.id)
      : await supabaseAdmin.from("customer_children").insert(values);
    if (error) return new Error(error.message);
  }

  return null;
}
