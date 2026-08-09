"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { counterSignInAddresses } from "@/lib/auth/login-domains";

export default function CounterLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [staffCode, setStaffCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!isSupabaseConfigured) {
      setError("Counter sign-in is unavailable until Supabase is configured.");
      return;
    }

    const cleanCode = staffCode.trim().toUpperCase();
    if (!cleanCode) {
      setError("Enter your CounterID.");
      return;
    }

    setLoading(true);

    // A CounterID maps to more than one address while the sign-in domain is
    // moving off `.local`: cashiers provisioned under the old suffix are still
    // real Auth users, and refusing them here would read as a wrong password.
    // `counterSignInAddresses` puts the current domain first, so a migrated
    // cashier costs exactly one request.
    let signedIn = false;
    for (const email of counterSignInAddresses(cleanCode)) {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (!loginError) {
        signedIn = true;
        break;
      }
    }

    if (!signedIn) {
      setError("Invalid CounterID or password.");
      setLoading(false);
      return;
    }

    // Signing in proves the password. It does not prove this account is
    // assigned to a counter — without this probe an authenticated non-counter
    // user would bounce login -> guard -> login forever.
    const probe = await fetch("/api/counter/session");
    if (!probe.ok) {
      await supabase.auth.signOut();
      setError(
        "That account signed in but is not assigned to a counter. Ask an administrator to set up your counter access.",
      );
      setLoading(false);
      return;
    }

    router.refresh();
    const next = searchParams.get("next");
    const destination =
      next?.startsWith("/BaebeCounter") && !next.startsWith("//")
        ? next
        : "/BaebeCounter";
    router.replace(destination);
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "var(--color-cream)" }}
    >
      <div className="w-full max-w-md">
        <section className="rounded-[2.5rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-cream)] shadow-inner">
            <Image
              src="/baebe-boo.jpg"
              alt="Baebe Boo"
              width={80}
              height={80}
              priority
              className="h-20 w-20 rounded-full object-cover"
            />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Baebe Counter</h1>
          <p
            className="mx-auto mt-3 max-w-xs text-sm leading-6"
            style={{ color: "var(--color-ink-soft)" }}
          >
            Sign in with the CounterID and password issued to you.
          </p>

          <form onSubmit={login} className="mt-8 space-y-5 text-left">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label
              className="block text-sm font-semibold"
              style={{ color: "var(--color-ink-soft)" }}
            >
              CounterID
              <input
                value={staffCode}
                onChange={(event) => setStaffCode(event.target.value)}
                placeholder="e.g. BB1A2B3C"
                autoComplete="username"
                autoCapitalize="characters"
                className="admin-input mt-2 uppercase"
                required
              />
            </label>

            <label
              className="block text-sm font-semibold"
              style={{ color: "var(--color-ink-soft)" }}
            >
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                className="admin-input mt-2"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="admin-button h-14 w-full"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 flex items-start gap-3 rounded-3xl bg-[var(--color-cream)] p-4 text-left">
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--color-brand-deep)" }}
            />
            <p className="text-xs leading-5" style={{ color: "var(--color-ink-soft)" }}>
              Your CounterID decides which shop you can sell from. Everything you
              see and every sale you ring up is scoped to that shop.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
