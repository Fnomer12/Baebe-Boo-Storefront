import type { Metadata } from "next";
import EmailCodeSignIn from "@/components/account/EmailCodeSignIn";
import { StorefrontPage } from "@/components/storefront/StorefrontChrome";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Access your Baebe Boo orders, rewards, wishlist and registry.",
};

export default async function AccountLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <StorefrontPage>
      <div className="storefront-shell pb-24 pt-28 sm:pt-32">
        <div className="mx-auto max-w-md">
          <section className="rounded-[2rem] bg-white p-6 shadow-[var(--shadow-md)] sm:p-9">
            <p className="storefront-eyebrow">Baebe Boo family</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1>
            <p className="mt-3 mb-8 text-sm leading-7 text-black/60">
              No password to remember. We will email you a 6-digit code to sign in.
            </p>
            {error === "invalid-link" && (
              <p role="alert" className="mb-6 rounded-2xl bg-[var(--color-brand-tint)] p-4 text-sm leading-6">
                That sign-in link has expired or has already been used. Enter your email for a fresh code.
              </p>
            )}
            <EmailCodeSignIn next={next} />
            <p className="mt-6 text-xs leading-5 text-black/45">
              Guest checkout is always available. Signing in lets you sync orders, addresses,
              rewards, wishlists and gift registries.
            </p>
          </section>
        </div>
      </div>
    </StorefrontPage>
  );
}
