import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { blankToUndefined, fieldErrors } from "@/lib/admin/schema-helpers";
import {
  collectChildren,
  fullChildName,
  normalizeEmail,
  type ChildRow,
  type MemberRow,
} from "@/domain/crm/customer-identity";
import {
  nextBirthdayChild,
  type AdminCustomer,
  type AdminCustomerChild,
} from "@/domain/admin-customers";
import { loadMembers } from "./_customer-record";

/**
 * The customer list, now built from `customer_profiles`.
 *
 * It used to be built from `members`, which meant a customer who signed in and
 * shopped was invisible here unless they had also filled in the homepage form —
 * while the CSV export button immediately to the right of this table read
 * `report_top_customers`, a view over `customer_profiles`. The screen and its
 * own export button disagreed about who the customers were.
 *
 * Unconverted `members` rows are still listed, flagged `hasAccount: false`, so
 * nothing disappears in the window between this deploying and
 * `scripts/backfill-customer-merge.mjs` running.
 */
export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  let profiles: ProfileListRow[];
  let members: MemberRow[];
  try {
    [profiles, members] = await Promise.all([loadProfiles(), loadMembers()]);
  } catch {
    return NextResponse.json({ message: "Customers could not be loaded." }, { status: 500 });
  }

  const userIds = profiles.map((profile) => profile.user_id);
  const [children, rewards, spend] = await Promise.all([
    loadChildren(userIds),
    loadRewards(userIds),
    loadSpend(userIds),
  ]);

  const membersByUser = new Map<string, MemberRow[]>();
  const membersByEmail = new Map<string, MemberRow[]>();
  for (const member of members) {
    if (member.user_id) push(membersByUser, member.user_id, member);
    const email = normalizeEmail(member.email);
    if (email) push(membersByEmail, email, member);
  }

  const claimedMemberIds = new Set<string>();
  const customers: AdminCustomer[] = profiles.map((profile) => {
    const email = normalizeEmail(profile.email);
    const owned = dedupeById([
      ...(membersByUser.get(profile.user_id) || []),
      ...(email ? membersByEmail.get(email) || [] : []),
    ]);
    for (const member of owned) claimedMemberIds.add(member.id);

    const childRows = collectChildren(children.get(profile.user_id) || [], owned);
    const reward = rewards.get(profile.user_id);
    const money = spend.get(profile.user_id);

    return buildCustomer({
      id: profile.user_id,
      userId: profile.user_id,
      hasAccount: true,
      memberCode: owned.find((member) => member.member_code)?.member_code || "",
      parentName: profile.full_name || owned[0]?.parent_name || "",
      phone: profile.phone || owned.find((member) => member.phone)?.phone || "",
      email,
      createdAt: profile.created_at || "",
      marketingStatus: profile.marketing_status || "unknown",
      children: childRows,
      loyalty: {
        availablePoints: Number(reward?.available_points || 0),
        pendingPoints: Number(reward?.pending_points || 0),
        lifetimePoints: Number(reward?.lifetime_points || 0),
        paidOrders: Number(money?.total_orders || 0),
        lifetimeSpend: Number(money?.lifetime_spend || 0),
      },
    });
  });

  // Leads that no account has claimed. They have no orders and no points by
  // definition — there is no account for either to hang off.
  for (const member of members) {
    if (claimedMemberIds.has(member.id)) continue;
    const child = childFrom(member);
    customers.push(
      buildCustomer({
        id: member.id,
        userId: null,
        hasAccount: false,
        memberCode: member.member_code || "",
        parentName: member.parent_name || "",
        phone: member.phone || "",
        email: normalizeEmail(member.email),
        createdAt: member.created_at || "",
        marketingStatus: "unknown",
        children: child ? [child] : [],
        loyalty: {
          availablePoints: 0,
          pendingPoints: 0,
          lifetimePoints: 0,
          paidOrders: 0,
          lifetimeSpend: 0,
        },
      }),
    );
  }

  customers.sort((first, second) => (second.createdAt || "").localeCompare(first.createdAt || ""));

  return NextResponse.json({ customers });
}

const createSchema = z.object({
  email: z.email("Enter a valid email address."),
  fullName: z.string().trim().min(2, "Enter the parent's name.").max(120),
  phone: blankToUndefined(z.string().trim().min(7, "A phone number needs at least 7 digits.").max(24)),
  dateOfBirth: blankToUndefined(z.iso.date("Use a date like 1990-04-23.")),
  marketingStatus: z.enum(["unknown", "subscribed", "unsubscribed"]).default("unknown"),
  childFirstName: blankToUndefined(z.string().trim().min(1).max(80)),
  childDateOfBirth: blankToUndefined(z.iso.date("Use a date like 2022-08-05.")),
});

/**
 * Create a customer from the admin panel.
 *
 * There was no way to do this at all before — no create, no edit, nothing. The
 * account is minted through the GoTrue admin API, which fires the
 * `bootstrap_customer_account` trigger on `auth.users` and gets the profile and
 * the reward account for free. It sends the customer NO email: an admin adding
 * somebody who walked into the shop should not trigger a "confirm your
 * address" message the customer did not ask for.
 */
export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("customers:write");
  if (!authorization.authorized) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Check the highlighted fields.", errors: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (created.error) {
    const alreadyExists = /already|registered|exists/i.test(created.error.message);
    return NextResponse.json(
      {
        message: alreadyExists
          ? "That email address already belongs to a customer."
          : "The customer could not be created.",
        errors: alreadyExists ? { email: "This customer is already on the list." } : {},
      },
      { status: alreadyExists ? 409 : 500 },
    );
  }

  const userId = created.data.user?.id;
  if (!userId) {
    return NextResponse.json({ message: "The customer could not be created." }, { status: 500 });
  }

  // The trigger has already inserted the profile; this fills in what the admin
  // typed. Upsert rather than update so a missing trigger is not a silent
  // half-created customer.
  const { error: profileError } = await supabaseAdmin.from("customer_profiles").upsert(
    {
      user_id: userId,
      email,
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      date_of_birth: parsed.data.dateOfBirth ?? null,
      marketing_status: parsed.data.marketingStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profileError) {
    return NextResponse.json(
      { message: "The account was created but their details could not be saved." },
      { status: 500 },
    );
  }

  if (parsed.data.childFirstName || parsed.data.childDateOfBirth) {
    // The result was discarded, so a rejected child write — a constraint, a
    // missing column, RLS — was reported to the admin as a completed customer.
    // The child is the whole point of recording the family: no child row means
    // no birthday, which means no birthday campaign and no birthday points, and
    // nobody would find out until the birthday quietly passed.
    const { error: childError } = await supabaseAdmin.from("customer_children").insert({
      user_id: userId,
      first_name: parsed.data.childFirstName ?? null,
      date_of_birth: parsed.data.childDateOfBirth ?? null,
    });
    if (childError) {
      return NextResponse.json(
        {
          message:
            "The customer was added but their child could not be saved. Open the customer and add the child again — until you do, they will not appear in birthday campaigns.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ customer: { id: userId, email } }, { status: 201 });
}

type ProfileListRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  marketing_status: string | null;
  created_at: string | null;
};

/**
 * Every profile, past PostgREST's 1000-row ceiling.
 *
 * A plain `.select()` silently stops at 1000 rows, which for a customer list is
 * not a slow page — it is a customer who does not exist as far as the shop is
 * concerned. Capped at 10 pages so a runaway cannot hang the admin panel.
 */
async function loadProfiles(): Promise<ProfileListRow[]> {
  const pageSize = 1000;
  const rows: ProfileListRow[] = [];

  for (let page = 0; page < 10; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("customer_profiles")
      .select("user_id, email, full_name, phone, marketing_status, created_at")
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw new Error(error.message);

    const batch = (data || []) as ProfileListRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function loadChildren(userIds: readonly string[]): Promise<Map<string, ChildRow[]>> {
  const byUser = new Map<string, ChildRow[]>();
  if (userIds.length === 0) return byUser;

  const { data } = await supabaseAdmin
    .from("customer_children")
    .select("user_id, first_name, date_of_birth")
    .in("user_id", userIds as string[]);

  for (const row of data || []) {
    push(byUser, row.user_id, { first_name: row.first_name, date_of_birth: row.date_of_birth });
  }
  return byUser;
}

type RewardRow = { user_id: string; available_points: number; pending_points: number; lifetime_points: number };

async function loadRewards(userIds: readonly string[]): Promise<Map<string, RewardRow>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from("reward_accounts")
    .select("user_id, available_points, pending_points, lifetime_points")
    .in("user_id", userIds as string[]);
  return new Map((data || []).map((row) => [row.user_id, row as RewardRow]));
}

type SpendRow = { total_orders: number; lifetime_spend: number };

/**
 * Order totals from `report_top_customers` — the same view the CSV export on
 * this screen reads, so the table and the download can no longer disagree.
 * A missing view degrades to zeroes rather than a 500: a customer list with no
 * spend figures is still a usable customer list.
 */
async function loadSpend(userIds: readonly string[]): Promise<Map<string, SpendRow>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("report_top_customers")
    .select("user_id, total_orders, lifetime_spend")
    .in("user_id", userIds as string[]);
  if (error) return new Map();

  return new Map(
    (data || []).map((row) => [
      String(row.user_id),
      { total_orders: Number(row.total_orders || 0), lifetime_spend: Number(row.lifetime_spend || 0) },
    ]),
  );
}

function buildCustomer(input: {
  id: string;
  userId: string | null;
  hasAccount: boolean;
  memberCode: string;
  parentName: string;
  phone: string;
  email: string;
  createdAt: string;
  marketingStatus: string;
  children: ChildRow[];
  loyalty: AdminCustomer["loyalty"];
}): AdminCustomer {
  const children: AdminCustomerChild[] = input.children.map((child) => ({
    firstName: child.first_name || "",
    dateOfBirth: child.date_of_birth,
  }));
  const leading = nextBirthdayChild(children);

  return {
    id: input.id,
    userId: input.userId,
    memberCode: input.memberCode,
    parentName: input.parentName,
    childName: leading?.firstName || "",
    phone: input.phone,
    email: input.email,
    childDob: leading?.dateOfBirth || "",
    createdAt: input.createdAt,
    hasAccount: input.hasAccount,
    marketingStatus: input.marketingStatus,
    children,
    loyalty: input.loyalty,
  };
}

function childFrom(member: MemberRow): ChildRow | null {
  const name = fullChildName(member);
  const dob = member.child_date_of_birth;
  if (!name && !dob) return null;
  return { first_name: member.child_first_name || name || null, date_of_birth: dob };
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

function dedupeById(rows: MemberRow[]): MemberRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
