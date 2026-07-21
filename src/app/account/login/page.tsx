import type { Metadata } from "next";
import Link from "next/link";
import { Baby } from "lucide-react";
import MagicLinkForm from "@/components/account/MagicLinkForm";

export const metadata: Metadata = {
  title: "Sign in | Baebe Boo",
  description: "Access your Baebe Boo orders, rewards, wishlist and registry.",
};

export default function AccountLoginPage() {
  return (
    <main className="min-h-screen bg-[#f8f5f0] px-4 py-12 text-black sm:py-20">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold">
          <Baby size={20} /> Baebe Boo
        </Link>
        <section className="rounded-[2rem] border border-white bg-white/90 p-6 shadow-xl shadow-sky-100/60 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
            Baebe Boo Family
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-3 mb-8 text-sm leading-7 text-black/60">
            No password to remember. We will send a one-time secure link to your email.
          </p>
          <MagicLinkForm />
          <p className="mt-6 text-xs leading-5 text-black/45">
            Guest checkout is always available. Signing in lets you sync orders, addresses,
            rewards, wishlists and gift registries.
          </p>
        </section>
      </div>
    </main>
  );
}
