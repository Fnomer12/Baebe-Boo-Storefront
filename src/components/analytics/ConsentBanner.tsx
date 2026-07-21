"use client";

import { useEffect, useState } from "react";

type Consent = "all" | "essential";

export default function ConsentBanner() {
  const [choice, setChoice] = useState<Consent | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("baebe_consent_v1");
    if (stored === "all" || stored === "essential") {
      queueMicrotask(() => setChoice(stored));
    }
  }, []);

  if (choice) return null;

  function save(value: Consent) {
    window.localStorage.setItem("baebe_consent_v1", value);
    window.dispatchEvent(new CustomEvent("baebe_consent_changed", { detail: value }));
    setChoice(value);
  }

  return (
    <aside aria-label="Privacy choices" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur sm:flex sm:items-center sm:gap-5 sm:p-5">
      <div className="flex-1">
        <p className="font-semibold">Your privacy matters</p>
        <p className="mt-1 text-xs leading-5 text-black/55">Essential storage keeps your cart and sign-in working. With permission, analytics helps us improve the family shopping experience.</p>
      </div>
      <div className="mt-4 flex gap-2 sm:mt-0">
        <button onClick={() => save("essential")} className="flex-1 rounded-full border border-black/10 px-4 py-2.5 text-xs font-semibold sm:flex-none">Essential only</button>
        <button onClick={() => save("all")} className="flex-1 rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white sm:flex-none">Allow analytics</button>
      </div>
    </aside>
  );
}
