import Link from "next/link";
import { CheckCircle2, Clock3, PackageSearch, ShoppingBag, ReceiptText } from "lucide-react";
import Navbar from "@/components/Navbar";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase-admin";

export const metadata = {
  title: "Order confirmed — Baebe Boo",
  robots: { index: false },
};

/** BB-<ms timestamp>-<8 uppercase hex>, the shape the initialize route mints. */
const ORDER_NUMBER = /^BB-\d{10,16}-[0-9A-F]{8}$/i;

/**
 * Only the order number travels in the URL, and the number alone unlocks
 * nothing: tracking and the public receipt both also require the checkout
 * email, and the account receipt requires the session. The receipt link is
 * shown only after confirming this session owns the order, so a signed-in
 * user who checked out as a guest never gets a dead link.
 */
async function sessionOwnsOrder(orderNumber: string): Promise<boolean> {
  if (!isSupabaseAdminConfigured) return false;
  const supabase = await tryCreateServerSupabaseClient();
  if (!supabase) return false;
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber)
    .eq("customer_user_id", userId)
    .limit(1);
  return Boolean(data?.length);
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; pending?: string }>;
}) {
  const params = await searchParams;
  const rawOrder = (params.order ?? "").trim();
  const orderNumber = ORDER_NUMBER.test(rawOrder) ? rawOrder.toUpperCase() : null;
  const pending = params.pending === "1";
  const showReceiptLink = orderNumber ? await sessionOwnsOrder(orderNumber) : false;

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-black">
      <Navbar cartCount={0} />

      <section className="px-3 pb-16 pt-24 sm:px-4 sm:pt-28 md:px-6 md:pt-32">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-[2rem] border border-black/10 bg-white p-6 text-center shadow-sm sm:p-10">
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
                pending ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"
              }`}
            >
              {pending ? <Clock3 size={30} /> : <CheckCircle2 size={30} />}
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              {pending ? "Payment received" : "Order confirmed"}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/55">
              {pending
                ? "We're finalizing your order now. Your confirmation email will arrive shortly — no need to pay again."
                : "Thank you for shopping with Baebe Boo. A receipt has been sent to the email you used at checkout."}
            </p>

            {orderNumber && (
              <div className="mt-6 rounded-2xl bg-[#F8F5F0] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-widest text-black/40">
                  Order number
                </p>
                <p className="mt-1 break-all text-lg font-bold">{orderNumber}</p>
              </div>
            )}

            <div className="mt-8 grid gap-3">
              {orderNumber && (
                <Link
                  href={`/orders/track?order=${encodeURIComponent(orderNumber)}`}
                  className="flex h-13 min-h-12 items-center justify-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white"
                >
                  <PackageSearch size={17} /> Track your order
                </Link>
              )}
              {orderNumber && showReceiptLink && (
                <Link
                  href={`/account/orders/${encodeURIComponent(orderNumber)}/receipt`}
                  className="flex h-13 min-h-12 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-6 text-sm font-semibold"
                >
                  <ReceiptText size={17} /> View receipt
                </Link>
              )}
              <Link
                href="/store"
                className="flex h-13 min-h-12 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-6 text-sm font-semibold"
              >
                <ShoppingBag size={17} /> Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
