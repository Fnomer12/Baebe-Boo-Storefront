"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type MfaMode = "loading" | "enroll" | "challenge";

export default function AdminMfa() {
  const [mode, setMode] = useState<MfaMode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const inspectFactors = async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError("Could not inspect two-factor security. Sign in again.");
        setMode("enroll");
        return;
      }

      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setMode("challenge");
        return;
      }

      setMode("enroll");
    };

    void inspectFactors();
  }, []);

  const beginEnrollment = async () => {
    setBusy(true);
    setError("");

    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === "totp" && factor.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Baebe Boo Admin",
    });
    if (enrollError) {
      setError(enrollError.message);
      setBusy(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setBusy(false);
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (verifyError) {
      setError("That code could not be verified. Wait for a new code and retry.");
      setBusy(false);
      return;
    }

    window.location.assign("/BaebeAdmin");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F5F0] px-4 py-12">
      <section className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-sm sm:p-10">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-black text-white">
            <ShieldCheck size={30} />
          </div>
          <h1 className="text-3xl font-semibold">Two-factor security</h1>
          <p className="mt-3 text-sm leading-6 text-black/55">
            Admin access requires a fresh code from an authenticator app.
          </p>
        </div>

        {mode === "loading" && <p className="mt-8 text-center text-sm">Checking security…</p>}

        {mode === "enroll" && !qrCode && (
          <button
            type="button"
            onClick={beginEnrollment}
            disabled={busy}
            className="mt-8 h-14 w-full rounded-full bg-black text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Set up authenticator"}
          </button>
        )}

        {qrCode && (
          <div className="mt-8 rounded-3xl bg-[#F8F5F0] p-5 text-center">
            <Image src={qrCode} alt="Authenticator QR code" width={220} height={220} unoptimized className="mx-auto rounded-xl" />
            <p className="mt-4 text-xs leading-5 text-black/55">Scan this once, or enter the setup key manually.</p>
            <code className="mt-2 block break-all text-xs font-semibold">{secret}</code>
          </div>
        )}

        {(mode === "challenge" || qrCode) && (
          <form onSubmit={verify} className="mt-6 space-y-4">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              aria-label="Authenticator code"
              className="h-14 w-full rounded-full border border-black/10 px-5 text-center text-lg tracking-[0.35em] outline-none focus:border-black"
            />
            <button disabled={busy} className="h-14 w-full rounded-full bg-black text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
          </form>
        )}

        {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      </section>
    </main>
  );
}
