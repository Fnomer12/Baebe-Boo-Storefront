import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Gift,
  Heart,
  MapPin,
  PackageCheck,
  RotateCcw,
  Share2,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
  UserRound,
} from "lucide-react";
import AccountSignOut from "@/components/account/AccountSignOut";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My account",
  description: "Manage orders, addresses, rewards, wishlists, vouchers, referrals and registries.",
};

export default async function AccountPage() {
  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) redirect("/account/login");
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/account/login");

  const userId = authData.user.id;
  const userEmail = authData.user.email ?? "";
  const voucherFilter = userEmail
    ? `sender_user_id.eq.${userId},recipient_email.eq.${userEmail}`
    : `sender_user_id.eq.${userId}`;
  const [profileResult, ordersResult, rewardsResult, addressesResult, wishlistsResult, registriesResult, childrenResult, vouchersResult, referralsResult] =
    await Promise.all([
      supabase.from("customer_profiles").select("full_name, email, phone").eq("user_id", userId).maybeSingle(),
      supabase.from("orders").select("id, order_number, total_amount, order_status, created_at").eq("customer_user_id", userId).order("created_at", { ascending: false }).limit(3),
      supabase.from("reward_accounts").select("available_points, pending_points").eq("user_id", userId).maybeSingle(),
      supabase.from("customer_addresses").select("id").eq("user_id", userId),
      supabase.from("wishlists").select("id").eq("user_id", userId),
      supabase.from("gift_registries").select("id").eq("user_id", userId),
      supabase.from("customer_children").select("id").eq("user_id", userId).limit(1),
      supabase.from("gift_vouchers").select("id").or(voucherFilter),
      supabase.from("referrals").select("id").eq("referrer_user_id", userId),
    ]);

  const profile = profileResult.data;
  const orders = ordersResult.data ?? [];
  const rewards = rewardsResult.data;
  const name = profile?.full_name?.split(" ")[0] || authData.user.email?.split("@")[0] || "there";
  const profileIncomplete = !profile?.full_name || !(childrenResult.data?.length ?? 0);

  /**
   * Counts are shown only when they exist. A grid of "0"s tells a new customer
   * nothing except that they have nothing, and it was previously taking up half
   * the page.
   */
  const sections = [
    { label: "Orders", count: orders.length, icon: PackageCheck, href: "/account/orders" },
    { label: "Reward points", count: rewards?.available_points ?? 0, icon: Sparkles, href: "/account/rewards" },
    { label: "Gift vouchers", count: vouchersResult.data?.length ?? 0, icon: Ticket, href: "/account/vouchers" },
    { label: "Wishlists", count: wishlistsResult.data?.length ?? 0, icon: Heart, href: "/account/wishlist" },
    { label: "Saved addresses", count: addressesResult.data?.length ?? 0, icon: MapPin, href: "/account/addresses" },
    { label: "Gift registries", count: registriesResult.data?.length ?? 0, icon: Gift, href: "/account/registries" },
    { label: "Referrals", count: referralsResult.data?.length ?? 0, icon: Share2, href: "/account/referrals" },
    { label: "Returns", count: 0, icon: RotateCcw, href: "/account/returns" },
    { label: "Your reviews", count: 0, icon: Star, href: "/account/reviews" },
  ];

  // Exactly one primary action, chosen by what the account actually needs next.
  const nextStep = profileIncomplete
    ? {
        eyebrow: "Finish setting up",
        title: "Tell us about your family",
        body: "Add your name and your children's age ranges, and we'll point you to things that actually suit their stage.",
        cta: "Complete profile",
        href: "/account/profile",
        icon: UserRound,
      }
    : orders.length === 0
      ? {
          eyebrow: "Your first order",
          title: "Nothing here yet — let's fix that",
          body: "Browse clothing, shoes, feeding, nursery and toys, chosen for every stage and delivered nationwide.",
          cta: "Start shopping",
          href: "/store",
          icon: ShoppingBag,
        }
      : null;

  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="storefront-eyebrow">My account</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hello, {name}</h1>
          </div>
          <AccountSignOut />
        </header>

        {nextStep && (
          <section className="mt-8 overflow-hidden rounded-[2rem] bg-[var(--color-brand-tint)] p-6 sm:p-9">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-brand-deep)]">
                <nextStep.icon size={16} /> {nextStep.eyebrow}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{nextStep.title}</h2>
              <p className="mt-3 leading-7 text-black/60">{nextStep.body}</p>
              <Link href={nextStep.href} className="storefront-primary-button mt-6">
                {nextStep.cta} <ArrowRight size={17} />
              </Link>
            </div>
          </section>
        )}

        {orders.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 className="text-xl font-semibold">Recent orders</h2>
              <Link href="/account/orders" className="text-sm font-semibold text-[var(--color-brand-deep)] underline underline-offset-4">
                All orders
              </Link>
            </div>
            <ul className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              {orders.map((order) => (
                <li key={order.id} className="border-b border-black/5 last:border-0">
                  <Link
                    href={`/orders/track?order=${order.order_number}`}
                    className="flex items-center justify-between gap-4 p-4 transition hover:bg-[var(--color-cream)] sm:px-6"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{order.order_number}</span>
                      <span className="mt-0.5 block text-xs capitalize text-black/45">
                        {String(order.order_status).replaceAll("_", " ")} ·{" "}
                        {new Date(order.created_at).toLocaleDateString("en-GH")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-semibold">
                      GH₵{Number(order.total_amount).toFixed(2)}
                      <ArrowRight size={16} className="text-black/30" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Everything in your account</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map(({ label, count, icon: Icon, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5 transition hover:ring-black/25"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-tint)] text-[var(--color-brand-deep)]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
                  {count > 0 && (
                    <span className="shrink-0 rounded-full bg-[var(--color-ink)] px-2 py-0.5 text-xs font-bold text-white">
                      {count}
                    </span>
                  )}
                  <ArrowRight size={16} className="shrink-0 text-black/25" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {!nextStep && (
          <p className="mt-8 text-sm text-black/55">
            Looking for something new?{" "}
            <Link href="/store" className="font-semibold text-[var(--color-brand-deep)] underline underline-offset-4">
              Browse the shop
            </Link>
            .
          </p>
        )}
      </div>
    </StorefrontPage>
  );
}
