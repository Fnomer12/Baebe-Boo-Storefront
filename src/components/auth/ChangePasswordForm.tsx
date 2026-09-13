"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, KeyRound, LockKeyhole } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Portal = "admin" | "counter";

const copy = {
  admin: {
    eyebrow: "Account security",
    title: "Change admin password",
    description: "Update the password used to sign in to the admin workspace.",
    backHref: "/BaebeAdmin",
    backLabel: "Back to admin workspace",
  },
  counter: {
    eyebrow: "Account security",
    title: "Change counter password",
    description: "Update the password used to sign in to this counter workspace.",
    backHref: "/BaebeCounter",
    backLabel: "Back to counter workspace",
  },
} as const;

export default function ChangePasswordForm({ portal }: { portal: Portal }) {
  const details = copy[portal];
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!isSupabaseConfigured) {
      setError("Password changes are unavailable until Supabase is configured.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Your new password must be different from the current password.");
      return;
    }

    setBusy(true);
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user?.email) {
        throw new Error("Your session has expired. Sign in again and try once more.");
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: data.user.email,
        password: currentPassword,
      });
      if (verifyError) {
        throw new Error("The current password is incorrect.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated successfully. You can keep working.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="border-b border-black/[0.07] pb-7">
        <a
          href={details.backHref}
          className="mb-5 inline-flex min-h-10 items-center rounded-xl text-sm font-semibold text-[#28637d] hover:text-[#101820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28637d] focus-visible:ring-offset-2"
        >
          {details.backLabel}
        </a>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28637d]">{details.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{details.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">{details.description}</p>
      </header>

      <section className="rounded-3xl border border-black/[0.07] bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-start gap-4 border-b border-black/[0.07] pb-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f5f5] text-[#28637d]">
            <KeyRound size={21} />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Update your password</h2>
            <p className="mt-1 text-sm leading-6 text-black/55">Confirm your current password, then choose a new one with at least 8 characters.</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
              <AlertCircle className="mt-0.5 shrink-0" size={17} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div role="status" className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
              <span>{success}</span>
            </div>
          )}

          <label className="block text-sm font-semibold text-black/65">
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="admin-input mt-2"
              required
            />
          </label>

          <label className="block text-sm font-semibold text-black/65">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="admin-input mt-2"
              required
            />
          </label>

          <label className="block text-sm font-semibold text-black/65">
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="admin-input mt-2"
              required
            />
          </label>

          <button type="submit" disabled={busy || !isSupabaseConfigured} className="admin-button h-12 w-full disabled:opacity-50">
            {busy ? "Updating password…" : <><LockKeyhole size={17} />Update password</>}
          </button>
        </form>
      </section>
    </div>
  );
}
