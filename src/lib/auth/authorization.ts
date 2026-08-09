import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

export type AdminAuthorization = {
  userId: string;
  email: string;
  role: "boss";
  assurance: {
    currentLevel: string | null;
    nextLevel: string | null;
  } | null;
};

export type CounterAuthorization = {
  userId: string;
  email: string;
  staff: {
    id: string;
    name: string;
    code: string;
    shop: {
      id: string;
      name: string;
      location: string;
      databaseName: string | null;
    };
  };
};

type CounterShopRow = {
  id: string;
  name: string;
  location: string;
  database_name: string | null;
  is_active: boolean;
};

type CounterStaffRow = {
  id: string;
  staff_name: string;
  staff_code: string;
  is_active: boolean;
  shops: CounterShopRow | CounterShopRow[] | null;
};

/**
 * Resolve the current admin from the signed Supabase cookie session.
 *
 * The `is_admin` RPC is backed by `admin_users` and executes the authorization
 * lookup inside Postgres, where that table is intentionally hidden from the
 * authenticated Data API role.
 */
export const getAdminAuthorization = cache(
  async (): Promise<AdminAuthorization | null> => {
    const supabase = await tryCreateServerSupabaseClient();
    if (!supabase) return null;
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id || !user.email) return null;

    const { data: isAdmin, error: authorizationError } = await supabase.rpc(
      "is_admin",
    );

    if (authorizationError || isAdmin !== true) return null;

    let assurance: AdminAuthorization["assurance"] = null;
    try {
      const { data, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!assuranceError && data) {
        assurance = {
          currentLevel: data.currentLevel,
          nextLevel: data.nextLevel,
        };
      }
    } catch {
      // MFA is temporarily disabled for the admin portal; do not gate access on it.
    }

    return {
      userId: user.id,
      email: user.email,
      role: "boss",
      assurance,
    };
  },
);

/**
 * Resolve the current counter assignment without accepting a staff code or
 * shop id from the browser.
 *
 * This is the *sole* source of truth for counter authorization — the layout,
 * every route handler and the shop scoping on every query all derive from it.
 *
 * The row is matched on `auth_user_id` HERE, in the query, and not left to RLS.
 * An earlier version of this function selected with a bare `.limit(1)` and a
 * comment explaining that `staff_counter_read` narrowed the result to the
 * caller's own row. That was true of the schema and false of the database: RLS
 * had been switched off on `shop_staff` in production, so the query returned
 * whichever row sorted first and *every* counter session — every cashier, and
 * in fact any signed-in Supabase user at all — became that person, at that
 * person's shop. See 20260807_restore_row_security.sql, which turns RLS back
 * on. Both halves are load-bearing: the filter below is the one that does not
 * depend on a setting somebody can flip in a dashboard.
 */
export const getCounterAuthorization = cache(
  async (): Promise<CounterAuthorization | null> => {
    const supabase = await tryCreateServerSupabaseClient();
    if (!supabase) return null;
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id || !user.email) return null;

    // `.limit(1)` rather than `.maybeSingle()`: `shop_staff_auth_user_uidx` is
    // a partial unique index on `auth_user_id`, so at most one row can match
    // and the limit is belt and braces. Should that ever stop holding,
    // PostgREST answers `maybeSingle()` with PGRST116 and the cashier is
    // silently locked out of the till mid-shift; taking the first row degrades
    // to "signed in at one of your shops" instead.
    const { data, error: authorizationError } = await supabase
      .from("shop_staff")
      .select(
        "id, staff_name, staff_code, is_active, shops (id, name, location, database_name, is_active)",
      )
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .limit(1);

    if (authorizationError || !data?.length) return null;

    const staff = data[0] as CounterStaffRow;
    const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

    if (!staff.id || !staff.staff_code || !shop?.id || !shop.is_active) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      staff: {
        id: staff.id,
        name: staff.staff_name,
        code: staff.staff_code,
        shop: {
          id: shop.id,
          name: shop.name,
          location: shop.location,
          databaseName: shop.database_name,
        },
      },
    };
  },
);

export async function requireAdmin(): Promise<AdminAuthorization> {
  const authorization = await getAdminAuthorization();
  if (!authorization) redirect("/BaebeAdmin/login");
  return authorization;
}

export async function requireCounter(): Promise<CounterAuthorization> {
  const authorization = await getCounterAuthorization();
  if (!authorization) redirect("/BaebeCounter/login");
  return authorization;
}
