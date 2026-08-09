import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AddressManager, { type SavedAddress } from "@/components/account/AddressManager";
import ReturnRequestForm, { type ReturnEligibleOrder } from "@/components/account/ReturnRequestForm";
import VerifiedReviewForm, { type ReviewablePurchase } from "@/components/account/VerifiedReviewForm";
import OrderHistory, { type Order } from "@/components/account/OrderHistory";
import RewardsDashboard, { type LoyaltyRule, type RewardAccount, type RewardLedgerEntry } from "@/components/account/RewardsDashboard";
import WishlistManager from "@/components/account/WishlistManager";
import GiftRegistryManager from "@/components/account/GiftRegistryManager";
import FamilyProfileManager from "@/components/account/FamilyProfileManager";
import ReferralTracker from "@/components/account/ReferralTracker";
import VoucherWallet, { type Voucher } from "@/components/account/VoucherWallet";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";

const sections = {
  orders: { title: "Order history", description: "Track deliveries, collections and past purchases." },
  rewards: { title: "Baebe Boo Rewards", description: "Earn 1 point for every paid GH₵1 in merchandise—an effective 1% reward value." },
  vouchers: { title: "Gift vouchers", description: "View your gift vouchers and balances." },
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
  return { title: content ? content.title : "Account" };
}

export default async function AccountSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const content = sections[section as SectionKey];
  if (!content) notFound();

  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) redirect("/account/login");
  const authData = await supabase.auth.getUser();
  if (!authData.data.user) redirect("/account/login");

  const userId = authData.data.user.id;
  const userEmail = authData.data.user.email ?? "";

  let orders: Order[] = [];
  let rewardAccount: RewardAccount | null = null;
  let rewardLedger: RewardLedgerEntry[] = [];
  let vouchers: Voucher[] = [];
  let addresses: SavedAddress[] = [];
  let returnRequests: Array<{
    id: string;
    reason: string;
    status: string;
    requested_at: string;
    resolved_at: string | null;
  }> = [];
  let returnEligibleOrders: ReturnEligibleOrder[] = [];
  let reviewablePurchases: ReviewablePurchase[] = [];
  let loyaltyRules: LoyaltyRule[] = [];

  if (section === "orders") {
    const result = await supabase
      .from("orders")
      .select(
        `id, order_number, total_amount, order_status, payment_status, created_at,
        order_items(id, product_id, product_name, quantity, unit_price, total_price)`,
      )
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false });
    orders = (result.data ?? []) as Order[];
  } else if (section === "rewards") {
    const [accountResult, ledgerResult, rulesResult] = await Promise.all([
      supabase.from("reward_accounts").select("available_points, pending_points, lifetime_points, updated_at").eq("user_id", userId).maybeSingle(),
      supabase.from("reward_ledger").select("id, entry_type, points, status, reason, created_at, order_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("loyalty_rules").select("event_type, points, is_active").eq("is_active", true),
    ]);
    rewardAccount = (accountResult.data as RewardAccount | null) ?? null;
    rewardLedger = (ledgerResult.data ?? []) as RewardLedgerEntry[];
    loyaltyRules = (rulesResult.data ?? []) as LoyaltyRule[];
  } else if (section === "vouchers") {
    const voucherFilter = userEmail
      ? `sender_user_id.eq.${userId},recipient_email.eq.${userEmail}`
      : `sender_user_id.eq.${userId}`;
    const result = await supabase
      .from("gift_vouchers")
      .select("id, code, initial_value, balance, currency, status, recipient_email, expires_at, created_at")
      .or(voucherFilter)
      .order("created_at", { ascending: false });
    vouchers = (result.data ?? []).map((voucher) => ({
      id: voucher.id,
      code: voucher.code,
      initialValue: voucher.initial_value,
      balance: voucher.balance,
      currency: voucher.currency,
      recipientEmail: voucher.recipient_email,
      status: voucher.status,
      expiresAt: voucher.expires_at,
      createdAt: voucher.created_at,
    })) as Voucher[];
  } else if (section === "addresses") {
    const result = await supabase
      .from("customer_addresses")
      .select("id, label, recipient_name, phone, address_line_1, address_line_2, city, region, digital_address, delivery_instructions, is_default")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    addresses = (result.data ?? []) as SavedAddress[];
  } else if (section === "returns") {
    const [returnResult, ordersResult] = await Promise.all([
      supabase.from("return_requests").select("id, reason, status, requested_at, resolved_at").eq("user_id", userId).order("requested_at", { ascending: false }),
      supabase.from("orders").select("id, order_number").eq("customer_user_id", userId).eq("payment_status", "paid").in("order_status", ["delivered", "completed"]).order("created_at", { ascending: false }),
    ]);
    returnRequests = (returnResult.data ?? []) as typeof returnRequests;
    const eligibleOrders = ordersResult.data ?? [];
    const itemsResult = eligibleOrders.length
      ? await supabase.from("order_items").select("id, order_id, product_name, quantity").in("order_id", eligibleOrders.map((order) => order.id))
      : { data: [] };
    const eligibleItems = itemsResult.data ?? [];
    returnEligibleOrders = eligibleOrders
      .map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        items: eligibleItems.filter((item) => item.order_id === order.id).map((item) => ({ id: item.id, productName: item.product_name, quantity: item.quantity })),
      }))
      .filter((order) => order.items.length > 0);
  } else if (section === "reviews") {
    const ordersResult = await supabase.from("orders").select("id, order_number").eq("customer_user_id", userId).eq("payment_status", "paid").in("order_status", ["delivered", "completed"]).order("created_at", { ascending: false });
    const eligibleOrders = ordersResult.data ?? [];
    const itemsResult = eligibleOrders.length
      ? await supabase.from("order_items").select("order_id, product_id, product_name").in("order_id", eligibleOrders.map((order) => order.id))
      : { data: [] };
    const orderLookup = new Map(eligibleOrders.map((order) => [order.id, order.order_number]));
    const seen = new Set<string>();
    reviewablePurchases = (itemsResult.data ?? []).flatMap((item) => {
      const key = `${item.order_id}:${item.product_id}`;
      if (!item.product_id || seen.has(key)) return [];
      seen.add(key);
      return [{ orderId: item.order_id, orderNumber: orderLookup.get(item.order_id) || "Order", productId: item.product_id, productName: item.product_name }];
    });
  }

  return (
    <StorefrontPage>
      <div className="storefront-shell pb-20 pt-28 sm:pt-32">
        <Link href="/account" className="text-sm font-semibold text-[var(--color-brand-deep)]">← My account</Link>
        <section className="mt-7 rounded-[2rem] bg-white p-6 shadow-sm sm:p-10">
          <p className="storefront-eyebrow">Baebe Boo family</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{content.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-black/55">{content.description}</p>

          {section === "orders" ? <OrderHistory orders={orders} /> : null}
          {section === "rewards" ? <RewardsDashboard account={rewardAccount} ledger={rewardLedger} rules={loyaltyRules} /> : null}
          {section === "vouchers" ? <VoucherWallet vouchers={vouchers} /> : null}
          {section === "addresses" ? <AddressManager addresses={addresses} /> : null}
          {section === "wishlist" ? <WishlistManager /> : null}
          {section === "registries" ? <GiftRegistryManager /> : null}
          {section === "profile" ? <FamilyProfileManager /> : null}
          {section === "returns" ? (
            <>
              <ReturnsList requests={returnRequests} />
              <ReturnRequestForm orders={returnEligibleOrders} />
            </>
          ) : null}
          {section === "reviews" ? <VerifiedReviewForm purchases={reviewablePurchases} /> : null}
          {section === "referrals" ? <ReferralTracker /> : null}
        </section>
      </div>
    </StorefrontPage>
  );
}

function ReturnsList({ requests }: { requests: Array<{ id: string; reason: string; status: string; requested_at: string; resolved_at: string | null }> }) {
  if (!requests.length) return null;

  return (
    <div className="mt-9">
      <h2 className="text-lg font-semibold">Existing return requests</h2>
      <ul className="mt-4 space-y-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded-3xl bg-[var(--color-cream)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{request.reason}</p>
              <StatusBadge status={request.status} />
            </div>
            <p className="mt-2 text-xs text-black/50">
              Requested {new Date(request.requested_at).toLocaleDateString("en-GH")}
              {request.resolved_at ? ` · Resolved ${new Date(request.resolved_at).toLocaleDateString("en-GH")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = String(status).replaceAll("_", " ");
  const color =
    status === "completed"
      ? "bg-green-100 text-green-800"
      : status === "approved"
        ? "bg-[var(--color-brand-tint)] text-[var(--color-brand-deep)]"
        : status === "rejected" || status === "cancelled"
          ? "bg-red-100 text-red-800"
          : "bg-amber-100 text-amber-800";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${color}`}>
      {label}
    </span>
  );
}
