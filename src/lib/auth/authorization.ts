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
  };
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

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (assuranceError || !assurance) return null;

    return {
      userId: user.id,
      email: user.email,
      role: "boss",
      assurance: {
        currentLevel: assurance.currentLevel,
        nextLevel: assurance.nextLevel,
      },
    };
  },
);

/**
 * Resolve the current counter assignment without accepting a staff code or
 * shop id from the browser. RLS on `shop_staff` authorizes the row through
 * `staff_authorizations` and limits the result to the signed-in staff member.
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

    const { data, error: authorizationError } = await supabase
      .from("shop_staff")
      .select(
        "id, staff_name, staff_code, shops (id, name, location, database_name, is_active)",
      )
      .maybeSingle();

    if (authorizationError || !data) return null;

    const staff = data as CounterStaffRow;
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
