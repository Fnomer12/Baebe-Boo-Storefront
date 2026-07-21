"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const cleanUsername = username.trim().toLowerCase();
    const loginEmail = cleanUsername.includes("@")
      ? cleanUsername
      : `${cleanUsername}@admin.baebe-boo.local`;
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (loginError) {
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    router.replace("/BaebeAdmin");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F5F0] px-4">
      <div className="w-full max-w-md rounded-[2.5rem] bg-white p-10 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-black text-white">
            <ShieldCheck size={30} />
          </div>
          <h1 className="text-4xl font-semibold">Baebe Admin</h1>
          <p className="mt-3 text-sm leading-6 text-black/50">
            Secure administration portal.
            <br />
            Access is restricted to authorized admin accounts.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-10 space-y-4">
          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username or email"
            autoComplete="username"
            className="h-14 w-full rounded-full border border-black/10 bg-white px-5 text-sm outline-none focus:border-black"
            required
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            className="h-14 w-full rounded-full border border-black/10 bg-white px-5 text-sm outline-none focus:border-black"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="flex h-16 w-full items-center justify-center rounded-full bg-black text-base font-semibold text-white shadow-sm transition hover:bg-black/80 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-black/40">
          Password authentication • Protected routes • Role-based access
        </p>
      </div>
    </main>
  );
}
