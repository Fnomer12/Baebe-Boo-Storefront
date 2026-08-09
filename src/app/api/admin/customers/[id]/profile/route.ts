import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  childAlreadyRecorded,
  childFromMember,
  fullChildName,
  type ChildRow,
} from "@/domain/crm/customer-identity";
import { resolveCustomer } from "../../_customer-record";

type AdminChildView = {
  id: string;
  firstName: string;
  dateOfBirth: string | null;
  ageRangeTaxonomyId: string | null;
  createdAt: string;
  /** `"member"` children cannot be edited until the backfill gives them an account. */
  source: "profile" | "member";
};

/**
 * The detail panel's profile tab.
 *
 * Resolution moved into `resolveCustomer`, which replaces
 * `.ilike(email).maybeSingle()`. That combination had two failure modes on real
 * data: `ilike` treated `%` and `_` in an address as wildcards, and
 * `maybeSingle()` threw outright when two profiles matched.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { id } = await params;

  let customer;
  try {
    customer = await resolveCustomer(id);
  } catch {
    return NextResponse.json({ message: "Customer could not be loaded." }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 });
  }

  const { data: childRows } = customer.userId
    ? await supabaseAdmin
        .from("customer_children")
        .select("id, first_name, date_of_birth, age_range_taxonomy_id, created_at")
        .eq("user_id", customer.userId)
        .order("date_of_birth", { ascending: false })
    : { data: [] };

  const saved: AdminChildView[] = (childRows || []).map((child) => ({
    id: child.id,
    firstName: child.first_name || "",
    dateOfBirth: child.date_of_birth ? String(child.date_of_birth) : null,
    ageRangeTaxonomyId: child.age_range_taxonomy_id,
    createdAt: child.created_at,
    /** Editable, because it is a real `customer_children` row. */
    source: "profile",
  }));

  // A child that only exists on a members row is shown too, marked so the UI
  // can say why it cannot be edited yet: until the backfill runs there is no
  // account to attach it to.
  const seen: ChildRow[] = saved.map((child) => ({
    first_name: child.firstName,
    date_of_birth: child.dateOfBirth,
  }));
  const pending: AdminChildView[] = [];
  for (const member of customer.members) {
    const child = childFromMember(member);
    if (!child || childAlreadyRecorded(seen, child)) continue;
    seen.push(child);
    pending.push({
      id: `member:${member.id}`,
      firstName: child.first_name || "",
      dateOfBirth: child.date_of_birth,
      ageRangeTaxonomyId: null,
      createdAt: member.created_at || "",
      source: "member",
    });
  }

  const member = customer.members[0] || null;

  return NextResponse.json({
    member: member
      ? {
          id: member.id,
          parentName: member.parent_name || "",
          childName: fullChildName(member),
          phone: member.phone || "",
          email: customer.email,
          childDob: member.child_date_of_birth,
          memberCode: member.member_code || "",
        }
      : null,
    profile: customer.profile
      ? {
          userId: customer.profile.user_id,
          email: customer.profile.email || "",
          fullName: customer.profile.full_name || "",
          phone: customer.profile.phone || "",
          dateOfBirth: customer.profile.date_of_birth,
          marketingStatus:
            (customer.profile as { marketing_status?: string }).marketing_status || "unknown",
          createdAt: customer.profile.created_at,
          updatedAt: (customer.profile as { updated_at?: string }).updated_at || null,
        }
      : null,
    hasAccount: Boolean(customer.userId),
    children: [...saved, ...pending],
  });
}
