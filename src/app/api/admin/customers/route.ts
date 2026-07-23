import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const authorization = await authorizeAdminApi("customers:read");
  if (!authorization.authorized) return authorization.response;

  const { data, error } = await supabaseAdmin
    .from("members")
    .select("id, member_code, parent_name, child_first_name, child_last_name, phone, email, child_date_of_birth, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: "Customers could not be loaded." }, { status: 500 });

  const customers = data || [];
  const emails = [...new Set(
    customers
      .map((customer) => String(customer.email || "").trim().toLowerCase())
      .filter(Boolean),
  )];
  const { data: profileData } = emails.length
    ? await supabaseAdmin
        .from("customer_profiles")
        .select("user_id,email")
        .in("email", emails)
    : { data: [] };
  const profiles = profileData || [];
  const userIds = profiles.map((profile) => profile.user_id);
  const [{ data: rewardData }, { data: orderData }] = await Promise.all([
    userIds.length
      ? supabaseAdmin
          .from("reward_accounts")
          .select("user_id,available_points,pending_points,lifetime_points")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    emails.length
      ? supabaseAdmin
          .from("orders")
          .select("customer_email,total_amount,payment_status")
          .in("customer_email", emails)
      : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    customers: customers.map((customer) => {
      const email = String(customer.email || "").trim().toLowerCase();
      const profile = profiles.find(
        (candidate) => String(candidate.email || "").trim().toLowerCase() === email,
      );
      const rewards = (rewardData || []).find(
        (candidate) => candidate.user_id === profile?.user_id,
      );
      const paidOrders = (orderData || []).filter(
        (order) =>
          String(order.customer_email || "").trim().toLowerCase() === email &&
          order.payment_status === "paid",
      );

      return {
        id: customer.id,
        memberCode: customer.member_code || "",
        parentName: customer.parent_name || "",
        childName: [customer.child_first_name, customer.child_last_name]
          .filter(Boolean)
          .join(" "),
        phone: customer.phone || "",
        email,
        childDob: customer.child_date_of_birth,
        createdAt: customer.created_at,
        loyalty: {
          availablePoints: Number(rewards?.available_points || 0),
          pendingPoints: Number(rewards?.pending_points || 0),
          lifetimePoints: Number(rewards?.lifetime_points || 0),
          paidOrders: paidOrders.length,
          lifetimeSpend: paidOrders.reduce(
            (sum, order) => sum + Number(order.total_amount || 0),
            0,
          ),
        },
      };
    }),
  });
}
