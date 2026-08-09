"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock3, X } from "lucide-react";

type PromotionRow = {
  id: string;
  name: string;
  description: string | null;
  promotion_type: string;
  value: number | string;
  starts_at: string | null;
  ends_at: string | null;
};

function timeRemaining(endsAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return { seconds, label: days ? `${days}d ${hours}h ${minutes}m` : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` };
}

export default function ConversionPrompts() {
  const [promotion, setPromotion] = useState<PromotionRow | null>(null);
  const [now, setNow] = useState(0);
  const [showExit, setShowExit] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadPromotion() {
      const response = await fetch("/api/promotions/active");
      if (!response.ok) return;
      const result = (await response.json()) as { promotions?: PromotionRow[] };
      if (!active) return;
      const current = Date.now();
      const eligible = result.promotions?.find((item) => (!item.starts_at || new Date(item.starts_at).getTime() <= current) && (!item.ends_at || new Date(item.ends_at).getTime() > current));
      if (eligible) setPromotion(eligible);
    }
    void loadPromotion().catch(() => undefined);
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const onLeave = (event: MouseEvent) => {
      if (event.clientY <= 0 && !window.sessionStorage.getItem("baebe_exit_prompt_dismissed")) setShowExit(true);
    };
    document.addEventListener("mouseout", onLeave);
    return () => { active = false; window.clearTimeout(initialTick); window.clearInterval(timer); document.removeEventListener("mouseout", onLeave); };
  }, []);

  const countdown = promotion?.ends_at && now ? timeRemaining(promotion.ends_at, now) : null;
  const activePromotion = promotion && (!countdown || countdown.seconds > 0) ? promotion : null;
  function dismiss() {
    setShowExit(false);
    window.sessionStorage.setItem("baebe_exit_prompt_dismissed", "true");
  }

  return (
    <>
      {activePromotion && countdown && (
        <aside className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl items-center justify-center gap-3 rounded-t-2xl bg-[#201d1c] px-5 py-3 text-center text-sm text-white shadow-2xl sm:bottom-5 sm:rounded-full" aria-label="Active promotion">
          <Clock3 size={16} /><strong>{activePromotion.name}</strong><span className="text-white/70">ends in {countdown.label}</span>
        </aside>
      )}
      {showExit && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="exit-title" className="relative w-full max-w-lg rounded-[2rem] bg-[#fffaf4] p-7 shadow-2xl sm:p-9">
            <button type="button" onClick={dismiss} aria-label="Close" className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/5"><X size={18} /></button>
            <p className="storefront-eyebrow">Before you go</p>
            <h2 id="exit-title" className="mt-3 pr-8 text-3xl font-semibold">{activePromotion?.name || "A little more joy for your inbox"}</h2>
            <p className="mt-3 leading-7 text-black/60">{activePromotion?.description || "Join the Baebe Boo family for age-relevant ideas, member-first finds and thoughtful birthday moments."}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={activePromotion ? "/store" : "/#family-signup"} onClick={dismiss} className="storefront-primary-button">{activePromotion ? "Explore eligible finds" : "Join the family"}</Link>
              <button type="button" onClick={dismiss} className="storefront-secondary-button">Keep browsing</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
