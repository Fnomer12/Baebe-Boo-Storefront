"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";

const storageKey = "baebe_login_request";

type Step = "email" | "code";

type PendingRequest = { requestId: string; email: string; resendAt: number };

export default function EmailCodeSignIn({ next }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);
  const submittedCode = useRef("");

  // Survive a refresh mid-flow rather than stranding the user back on step one.
  // Deferred a tick so the first paint still matches the server render.
  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = window.sessionStorage.getItem(storageKey);
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved) as PendingRequest;
        if (!parsed.requestId) return;
        setRequestId(parsed.requestId);
        setEmail(parsed.email);
        setResendAt(parsed.resendAt);
        setStep("code");
      } catch {
        window.sessionStorage.removeItem(storageKey);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  // Deferred rather than set during the effect so the first paint matches the
  // server render — the same shape ConversionPrompts uses for its countdown.
  useEffect(() => {
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, []);

  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const sendCode = useCallback(async (address: string) => {
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.message || "We could not send your code. Please try again.");
      return false;
    }

    const payload = (await response.json()) as {
      requestId: string;
      resendAfterSeconds: number;
    };
    const nextResendAt = Date.now() + payload.resendAfterSeconds * 1000;
    setRequestId(payload.requestId);
    setResendAt(nextResendAt);
    setCode("");
    submittedCode.current = "";
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({ requestId: payload.requestId, email: address, resendAt: nextResendAt }),
    );
    return true;
  }, []);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    if (await sendCode(address)) {
      setEmail(address);
      setStep("code");
      setNotice(`We sent a 6-digit code to ${address}.`);
      window.setTimeout(() => codeInput.current?.focus(), 0);
    }
  }

  const submitCode = useCallback(
    async (value: string) => {
      if (pending || value.length !== 6) return;
      submittedCode.current = value;
      setPending(true);
      setError("");
      const response = await fetch("/api/auth/login-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, code: value }),
      }).catch(() => null);

      if (response?.ok) {
        const payload = (await response.json()) as { redirectTo: string };
        window.sessionStorage.removeItem(storageKey);
        const target = next?.startsWith("/") ? next : payload.redirectTo;
        router.replace(target);
        router.refresh();
        return;
      }

      setPending(false);
      const payload = await response?.json().catch(() => null);
      setError(payload?.message || "That code did not work. Please try again.");
      setCode("");
      codeInput.current?.focus();
    },
    [next, pending, requestId, router],
  );

  // Auto-submit once the sixth digit lands, but never twice for the same value —
  // otherwise a typo burns two of the five attempts.
  useEffect(() => {
    if (step !== "code" || code.length !== 6 || pending) return;
    if (submittedCode.current === code) return;
    void submitCode(code);
  }, [code, pending, step, submitCode]);

  async function resend() {
    if (cooldown > 0 || pending) return;
    if (await sendCode(email)) {
      setNotice(`We sent a new code to ${email}. The previous one no longer works.`);
      codeInput.current?.focus();
    }
  }

  function restart() {
    window.sessionStorage.removeItem(storageKey);
    setStep("email");
    setRequestId("");
    setCode("");
    setError("");
    setNotice("");
    submittedCode.current = "";
  }

  if (step === "email") {
    return (
      <form onSubmit={submitEmail} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Email address</span>
          <span className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3.5 focus-within:border-[var(--color-brand)]">
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
          className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
        >
          <ShieldCheck size={18} />
          {pending ? "Sending your code…" : "Email me a sign-in code"}
        </button>
        {error && (
          <p role="alert" className="rounded-2xl bg-[var(--color-brand-tint)] p-4 text-sm leading-6">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitCode(code);
      }}
      className="space-y-5"
    >
      <p role="status" className="text-sm leading-6 text-black/60">
        {notice || `We sent a 6-digit code to ${email}.`}
      </p>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Sign-in code</span>
        <input
          ref={codeInput}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="6-digit sign-in code"
          aria-invalid={Boolean(error)}
          placeholder="000000"
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-center text-lg tracking-[0.35em] outline-none focus:border-[var(--color-brand)]"
        />
      </label>
      <button
        disabled={pending || code.length !== 6}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-deep)] disabled:opacity-60"
      >
        <ShieldCheck size={18} />
        {pending ? "Checking your code…" : "Sign in"}
      </button>
      {error && (
        <p role="alert" className="rounded-2xl bg-[var(--color-brand-tint)] p-4 text-sm leading-6">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || pending}
          aria-live="polite"
          className="font-semibold text-[var(--color-brand-deep)] underline underline-offset-4 disabled:no-underline disabled:opacity-50"
        >
          {cooldown > 0 ? `Send a new code (0:${String(cooldown).padStart(2, "0")})` : "Send a new code"}
        </button>
        <button type="button" onClick={restart} className="text-black/55 underline underline-offset-4">
          Use a different email
        </button>
      </div>
    </form>
  );
}
