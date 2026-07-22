import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AddressManager, { type SavedAddress } from "@/components/account/AddressManager";
import ReturnRequestForm, { type ReturnEligibleOrder } from "@/components/account/ReturnRequestForm";
import VerifiedReviewForm, { type ReviewablePurchase } from "@/components/account/VerifiedReviewForm";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

const sections = {
  orders: { title: "Order history", description: "Track deliveries, collections and past purchases." },
  rewards: { title: "Baebe Boo Rewards", description: "Earn 1 point for every paid GH₵1 in merchandise—an effective 1% reward value." },
  addresses: { title: "Saved addresses", description: "Manage delivery details and GhanaPost GPS addresses." },
  wishlist: { title: "Wishlist", description: "Keep your family favourites together across devices." },
  registries: { title: "Gift registries", description: "Plan baby showers, birthdays and thoughtful gift lists." },
  profile: { title: "Family profile", description: "Keep your details and child age ranges up to date." },
  returns: { title: "Returns", description: "Request and track eligible returns." },
  reviews: { title: "Your reviews", description: "Share feedback from delivered purchases. Reviews are moderated before publication." },
  referrals: { title: "Referrals", description: "Invite another family and follow your rewards." },
} as const;

type SectionKey = keyof typeof sections;

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const content = sections[section as SectionKey];
  return { title: content ? `${content.title} | Baebe Boo` : "Account | Baebe Boo" };
}

export default async function AccountSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section as SectionKey];
  if (!content) notFound();

  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) redirect("/account/login");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/account/login");

  let records: Array<Record<string, unknown>> = [];
  let addresses: SavedAddress[] = [];
  let returnEligibleOrders: ReturnEligibleOrder[] = [];
  let reviewablePurchases: ReviewablePurchase[] = [];
  if (section === "orders") {
    const result = await supabase.from("orders").select("order_number, total_amount, order_status, created_at").eq("customer_user_id", data.user.id).order("created_at", { ascending: false });
    records = (result.data || []) as Array<Record<string, unknown>>;
  } else if (section === "rewards") {
    const result = await supabase.from("reward_ledger").select("points, status, reason, created_at").eq("user_id", data.user.id).order("created_at", { ascending: false });
    records = (result.data || []) as Array<Record<string, unknown>>;
  } else if (section === "addresses") {
    const result = await supabase.from("customer_addresses").select("id, label, recipient_name, phone, address_line_1, address_line_2, city, region, digital_address, delivery_instructions, is_default").eq("user_id", data.user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false });
    addresses = (result.data || []) as SavedAddress[];
  } else if (section === "wishlist") {
    const result = await supabase.from("wishlists").select("name, is_public, created_at, wishlist_items(product_id, products(name))").eq("user_id", data.user.id);
    records = (result.data || []) as Array<Record<string, unknown>>;
  } else if (section === "registries") {
    const result = await supabase.from("gift_registries").select("title, event_date, status, created_at").eq("user_id", data.user.id);
    records = (result.data || []) as Array<Record<string, unknown>>;
  } else if (section === "returns") {
    const [returnResult, ordersResult] = await Promise.all([
      supabase.from("return_requests").select("reason, status, requested_at, resolved_at").eq("user_id", data.user.id).order("requested_at", { ascending: false }),
      supabase.from("orders").select("id, order_number").eq("customer_user_id", data.user.id).eq("payment_status", "paid").in("order_status", ["delivered", "completed"]).order("created_at", { ascending: false }),
    ]);
    records = (returnResult.data || []) as Array<Record<string, unknown>>;
    const eligibleOrders = ordersResult.data || [];
    const itemsResult = eligibleOrders.length
      ? await supabase.from("order_items").select("id, order_id, product_name, quantity").in("order_id", eligibleOrders.map((order) => order.id))
      : { data: [] };
    const eligibleItems = itemsResult.data || [];
    returnEligibleOrders = eligibleOrders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      items: eligibleItems.filter((item) => item.order_id === order.id).map((item) => ({ id: item.id, productName: item.product_name, quantity: item.quantity })),
    })).filter((order) => order.items.length > 0);
  } else if (section === "reviews") {
    const ordersResult = await supabase.from("orders").select("id, order_number").eq("customer_user_id", data.user.id).eq("payment_status", "paid").in("order_status", ["delivered", "completed"]).order("created_at", { ascending: false });
    const eligibleOrders = ordersResult.data || [];
    const itemsResult = eligibleOrders.length
      ? await supabase.from("order_items").select("order_id, product_id, product_name").in("order_id", eligibleOrders.map((order) => order.id))
      : { data: [] };
    const orderLookup = new Map(eligibleOrders.map((order) => [order.id, order.order_number]));
    const seen = new Set<string>();
    reviewablePurchases = (itemsResult.data || []).flatMap((item) => {
      const key = `${item.order_id}:${item.product_id}`;
      if (!item.product_id || seen.has(key)) return [];
      seen.add(key);
      return [{ orderId: item.order_id, orderNumber: orderLookup.get(item.order_id) || "Order", productId: item.product_id, productName: item.product_name }];
    });
  } else if (section === "referrals") {
    const result = await supabase.from("referrals").select("code, status, created_at, qualified_at").eq("referrer_user_id", data.user.id);
    records = (result.data || []) as Array<Record<string, unknown>>;
  } else if (section === "profile") {
    const result = await supabase.from("customer_profiles").select("email, full_name, phone, date_of_birth, marketing_status").eq("user_id", data.user.id).maybeSingle();
    records = result.data ? [result.data as Record<string, unknown>] : [];
  }

  return (
    <main className="min-h-screen bg-[#f8f5f0] px-4 py-12 text-black sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/account" className="text-sm font-semibold text-sky-700">← My account</Link>
        <section className="mt-7 rounded-[2rem] bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Baebe Boo Family</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{content.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">{content.description}</p>
          {section === "addresses" ? <AddressManager addresses={addresses} /> : null}
          {section === "returns" ? <ReturnRequestForm orders={returnEligibleOrders} /> : null}
          {section === "reviews" ? <VerifiedReviewForm purchases={reviewablePurchases} /> : null}
          {records.length > 0 ? (
            <div className="mt-9 space-y-3">
              {records.map((record, index) => (
                <div key={index} className="grid gap-3 rounded-3xl bg-[#f8f5f0] p-5 sm:grid-cols-2">
                  {Object.entries(record).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/35">{key.replaceAll("_", " ")}</p>
                      <p className="mt-1 break-words text-sm font-semibold">{formatAccountValue(value)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : section !== "addresses" && section !== "returns" && section !== "reviews" ? (
            <div className="mt-9 rounded-3xl border border-dashed border-black/15 bg-[#f8f5f0] p-8 text-center">
              <p className="font-semibold">No {content.title.toLowerCase()} yet.</p>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/50">Use the storefront and checkout while signed in; updates will appear here automatically.</p>
              <Link href="/store" className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-sm font-semibold text-white">Continue shopping</Link>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function formatAccountValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-GH");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleDateString("en-GH", { dateStyle: "medium" });
  }
  return String(value).replaceAll("_", " ");
}
