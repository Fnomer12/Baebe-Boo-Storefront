import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Gift,
  Heart,
  MapPin,
  PackageCheck,
  RotateCcw,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";
import AccountSignOut from "@/components/account/AccountSignOut";
import WishlistSync from "@/components/account/WishlistSync";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My account | Baebe Boo",
  description: "Manage orders, addresses, rewards, wishlists and registries.",
};

export default async function AccountPage() {
  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/account/login");

  const userId = authData.user.id;
  const [profileResult, ordersResult, rewardsResult, addressesResult, wishlistsResult, registriesResult] =
    await Promise.all([
      supabase.from("customer_profiles").select("full_name, email, phone").eq("user_id", userId).maybeSingle(),
      supabase.from("orders").select("id, order_number, total_amount, order_status, created_at").eq("customer_user_id", userId).order("created_at", { ascending: false }).limit(5),
      supabase.from("reward_accounts").select("available_points, pending_points").eq("user_id", userId).maybeSingle(),
      supabase.from("customer_addresses").select("id").eq("user_id", userId),
      supabase.from("wishlists").select("id").eq("user_id", userId),
      supabase.from("gift_registries").select("id").eq("user_id", userId),
    ]);

  const profile = profileResult.data;
  const orders = ordersResult.data ?? [];
  const rewards = rewardsResult.data;
  const name = profile?.full_name || authData.user.email?.split("@")[0] || "Baebe Boo parent";

  const cards = [
    { label: "Orders", value: orders.length, icon: PackageCheck, href: "/account/orders" },
    { label: "Reward points", value: rewards?.available_points ?? 0, icon: Sparkles, href: "/account/rewards" },
    { label: "Saved addresses", value: addressesResult.data?.length ?? 0, icon: MapPin, href: "/account/addresses" },
    { label: "Wishlists", value: wishlistsResult.data?.length ?? 0, icon: Heart, href: "/account/wishlist" },
    { label: "Gift registries", value: registriesResult.data?.length ?? 0, icon: Gift, href: "/account/registries" },
    { label: "Returns", value: "Manage", icon: RotateCcw, href: "/account/returns" },
    { label: "Verified reviews", value: "Write", icon: Star, href: "/account/reviews" },
  ];

  return (
    <main className="min-h-screen bg-[#f8f5f0] px-4 py-10 text-black sm:px-6 sm:py-14">
      <WishlistSync />
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/" className="text-sm font-semibold text-sky-700">← Storefront</Link>
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-black/40">My account</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Hello, {name}</h1>
            <p className="mt-3 text-sm text-black/55">Everything for your family, in one trusted place.</p>
          </div>
          <AccountSignOut />
        </header>

        <section className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, href }) => (
            <Link key={label} href={href} className="rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <Icon size={22} className="text-sky-600" />
              <p className="mt-7 text-3xl font-semibold">{value}</p>
              <p className="mt-1 text-sm text-black/50">{label}</p>
            </Link>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-[2rem] bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Recent orders</h2>
              <Link href="/account/orders" className="text-sm font-semibold text-sky-700">View all</Link>
            </div>
            <div className="mt-6 space-y-3">
              {orders.length ? orders.map((order) => (
                <Link key={order.id} href={`/orders/track?order=${order.order_number}`} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f8f5f0] p-4">
                  <div><p className="font-semibold">{order.order_number}</p><p className="mt-1 text-xs text-black/45">{new Date(order.created_at).toLocaleDateString("en-GH")}</p></div>
                  <div className="text-right"><p className="font-semibold">GH₵{Number(order.total_amount).toFixed(2)}</p><p className="mt-1 text-xs capitalize text-sky-700">{String(order.order_status).replaceAll("_", " ")}</p></div>
                </Link>
              )) : <p className="rounded-2xl bg-[#f8f5f0] p-5 text-sm text-black/55">Your online orders will appear here after checkout.</p>}
            </div>
          </div>
          <aside className="rounded-[2rem] bg-[#ddf2ff] p-6 sm:p-8">
            <UserRound size={26} />
            <h2 className="mt-8 text-2xl font-semibold">Family profile</h2>
            <p className="mt-3 text-sm leading-7 text-black/60">Add child age ranges to receive useful product guidance and age-appropriate offers.</p>
            <Link href="/account/profile" className="mt-7 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white">Complete profile</Link>
          </aside>
        </section>
      </div>
    </main>
  );
}
