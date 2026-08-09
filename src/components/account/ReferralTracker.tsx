"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, Loader2, Share2, UserPlus } from "lucide-react";

export type Referral = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  qualified_at: string | null;
  rewarded_at: string | null;
  referred_user_id: string | null;
};

export default function ReferralTracker() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/account/referrals");
        const result = (await response.json().catch(() => ({ referrals: [], code: null }))) as {
          referrals?: Referral[];
          code?: string | null;
        };
        if (!cancelled) {
          setReferrals(Array.isArray(result.referrals) ? result.referrals : []);
          setCode(result.code ?? null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("We could not load your referrals.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createCode() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      if (!response.ok) {
        setError(result?.message || "We could not create a referral code.");
        return;
      }
      if (result?.code) {
        setCode(result.code);
        setMessage("Your referral code is ready to share.");
      }
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!code) return;
    const link = `${window.location.origin}/ref/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Could not copy link automatically.");
    }
  }

  if (loading) {
    return (
      <div className="mt-9 flex items-center justify-center rounded-3xl bg-[var(--color-cream)] p-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-brand-deep)]" />
      </div>
    );
  }

  const shareLink = typeof window !== "undefined" && code ? `${window.location.origin}/ref/${code}` : "";

  return (
    <div className="mt-9 space-y-8">
      {error ? <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-green-50 p-4 text-sm text-green-800">{message}</p> : null}

      <section className="rounded-3xl bg-[var(--color-brand-tint)] p-6">
        <div className="flex items-center gap-3">
          <Gift size={24} className="text-[var(--color-brand-deep)]" />
          <h2 className="text-xl font-semibold">Your referral code</h2>
        </div>

        {code ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-2xl bg-white px-5 py-3 text-2xl font-bold tracking-widest text-[var(--color-brand-deep)]">
                {code}
              </span>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white"
              >
                {copied ? <Share2 size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="mt-3 break-all text-sm text-black/60">{shareLink}</p>
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-sm leading-6 text-black/60">
              Invite another family to Baebe Boo. When they qualify, you both earn rewards.
            </p>
            <button
              type="button"
              onClick={createCode}
              disabled={creating}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {creating ? "Creating…" : "Create referral code"}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-[var(--color-cream)] p-6">
        <h2 className="text-lg font-semibold">Referral history</h2>
        {referrals.length ? (
          <ul className="mt-5 space-y-3">
            {referrals.map((referral) => (
              <li key={referral.id} className="rounded-2xl bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{referral.code}</p>
                    <p className="mt-1 text-xs text-black/50">
                      Shared {new Date(referral.created_at).toLocaleDateString("en-GH")}
                    </p>
                  </div>
                  <StatusBadge status={referral.status} />
                </div>
                {referral.qualified_at ? (
                  <p className="mt-2 text-xs text-black/50">
                    Qualified {new Date(referral.qualified_at).toLocaleDateString("en-GH")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-black/55">No referrals yet. Share your code to get started.</p>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = String(status).replaceAll("_", " ");
  const color =
    status === "rewarded"
      ? "bg-green-100 text-green-800"
      : status === "qualified"
        ? "bg-[var(--color-brand-tint)] text-[var(--color-brand-deep)]"
        : status === "rejected"
          ? "bg-red-100 text-red-800"
          : "bg-amber-100 text-amber-800";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${color}`}>{label}</span>
  );
}
