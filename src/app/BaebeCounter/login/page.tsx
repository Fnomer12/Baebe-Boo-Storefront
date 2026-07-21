"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";

export default function CounterLoginPage() {
  const [staffCode, setStaffCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanCode = staffCode.trim().toUpperCase();
    if (!cleanCode) {
      setError("Enter your CounterID.");
      return;
    }

    setLoading(true);
    const loginEmail = `${cleanCode.toLowerCase()}@counter.baebe-boo.local`;
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (loginError) {
      setError("Invalid CounterID or password.");
      setLoading(false);
      return;
    }

    sessionStorage.setItem("baebe_pending_counter_staff_code", cleanCode);
    window.location.assign("/BaebeCounter");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F5F0] px-4 text-black">
      <section className="w-full max-w-md rounded-[2.5rem] border border-white/70 bg-white/85 p-8 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-[#F8F5F0] shadow-inner">
          <img src="/baebe-boo.jpg" alt="Baebe Boo" className="h-20 w-20 rounded-full object-cover" />
        </div>
        <h1 className="text-3xl font-semibold">Baebe Counter Login</h1>
        <p className="mt-3 text-sm leading-6 text-black/50">
          Sign in with your CounterID and password.
        </p>

        <form onSubmit={login} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}
          <input
            value={staffCode}
            onChange={(event) => setStaffCode(event.target.value)}
            placeholder="COUNTER ID"
            autoComplete="username"
            className="h-14 w-full rounded-full border border-black/10 bg-white px-5 text-sm font-semibold uppercase outline-none focus:border-black"
            required
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="PASSWORD"
            autoComplete="current-password"
            className="h-14 w-full rounded-full border border-black/10 bg-white px-5 text-sm outline-none focus:border-black"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-full bg-black text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 flex items-start gap-3 rounded-3xl bg-black/[0.04] p-4 text-left">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-5 text-black/50">
            Access is locked by CounterID, password and assigned shop location.
          </p>
        </div>
      </section>
    </main>
  );
}
