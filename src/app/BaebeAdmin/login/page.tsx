"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, HelpCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { adminLoginDomain, adminSignInAddresses } from "@/lib/auth/login-domains";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!isSupabaseConfigured) {
      setError("Admin sign-in is unavailable until Supabase is configured.");
      return;
    }
    setLoading(true);

    // A short username maps to more than one address while the sign-in domain
    // is moving off `.local`: admins provisioned under the old suffix are still
    // real Auth users, and refusing them here would read as a wrong password.
    // A typed-in mailbox has exactly one spelling and is never expanded.
    let lastError = "";
    let signedIn = false;
    for (const email of adminSignInAddresses(username)) {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (!loginError) {
        signedIn = true;
        break;
      }
      lastError = loginError.message;
    }

    if (!signedIn) {
      setError(
        !lastError || lastError.includes("Invalid login credentials")
          ? "Invalid username or password. Try again or contact the site owner if you keep seeing this."
          : lastError,
      );
      setLoading(false);
      return;
    }

    router.refresh();
    const next = searchParams.get("next");
    const destination =
      next?.startsWith("/BaebeAdmin") && !next.startsWith("//") ? next : "/BaebeAdmin";
    router.replace(destination);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: "var(--color-cream)" }}>
      <div className="w-full max-w-md">
        <div className="rounded-[2.5rem] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 shadow-sm sm:p-10">
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-ink)] text-white shadow-sm">
              <ShieldCheck size={30} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--color-ink)" }}>
              Baebe Admin
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-6" style={{ color: "var(--color-ink-soft)" }}>
              Secure administration portal for authorised accounts only.
            </p>
          </div>

          <form onSubmit={handleLogin} className="mt-10 space-y-5">
            {error && (
              <div className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <label className="block text-sm font-semibold" style={{ color: "var(--color-ink-soft)" }}>
              Username or email
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. admin or admin@example.com"
                autoComplete="username"
                className="admin-input mt-2"
                required
              />
              <span className="mt-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)", opacity: 0.75 }}>
                Short usernames are sent as <code className="rounded bg-[var(--color-cream)] px-1 py-0.5 text-[11px]">{`username@${adminLoginDomain()}`}</code>
              </span>
            </label>

            <label className="block text-sm font-semibold" style={{ color: "var(--color-ink-soft)" }}>
              <span className="flex items-center justify-between">
                Password
                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-deep)] hover:underline"
                >
                  <HelpCircle size={13} />
                  {showHelp ? "Hide help" : "Need help?"}
                </button>
              </span>
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

            {showHelp && (
              <div className="rounded-2xl bg-[var(--color-cream)] p-4 text-sm" style={{ color: "var(--color-ink-soft)" }}>
                <p className="font-semibold" style={{ color: "var(--color-ink)" }}>Signing in for the first time?</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                  <li>Your account must be created in Supabase Authentication first.</li>
                  <li>An admin record in <code className="rounded bg-[var(--color-surface)] px-1">public.admin_users</code> with role <code className="rounded bg-[var(--color-surface)] px-1">boss</code> is also required.</li>
                  <li>If you are the site owner, create both in the Supabase dashboard, then refresh this page.</li>
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="admin-button mt-2 h-14 w-full"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Signing in…
                </span>
              ) : (
                <>
                  <LockKeyhole size={18} />
                  Sign in
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs" style={{ color: "var(--color-ink-soft)", opacity: 0.75 }}>
            Password-protected routes • Role-based access
          </p>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--color-ink-soft)", opacity: 0.6 }}>
          If you are not an authorised administrator, please leave this page.
        </p>
      </div>
    </main>
  );
}
