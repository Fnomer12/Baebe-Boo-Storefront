"use client";

import { FormEvent, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    if (!isSupabaseConfigured) {
      setPending(false);
      setMessage("Account sign-in is unavailable until Supabase is configured.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/account`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });

    setPending(false);
    setMessage(
      error
        ? error.message
        : "Check your inbox for your secure Baebe Boo sign-in link.",
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Email address</span>
        <span className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3.5 focus-within:border-sky-400">
          <Mail size={19} className="text-black/45" />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="parent@example.com"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </span>
      </label>
      <button
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-4 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:opacity-60"
      >
        <ShieldCheck size={18} />
        {pending ? "Sending secure link…" : "Email me a sign-in link"}
      </button>
      {message && (
        <p role="status" className="rounded-2xl bg-sky-50 p-4 text-sm leading-6">
          {message}
        </p>
      )}
    </form>
  );
}
