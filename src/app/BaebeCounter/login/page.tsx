"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";

type Shop = {
  id: string;
  name: string;
  location: string;
  database_name: string;
  is_active: boolean;
};

type StaffRow = {
  id: string;
  staff_name: string;
  staff_code: string;
  shop_id: string;
  shops: Shop | Shop[] | null;
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.3 35.1 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C36.9 39.3 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function CounterLoginPage() {
  const [staffCode, setStaffCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loginWithGoogle = async () => {
    setError("");

    const cleanCode = staffCode.trim().toUpperCase();

    if (!cleanCode) {
      setError("Enter your unique counter ID.");
      return;
    }

    const { data, error: staffError } = await supabase
      .from("shop_staff")
      .select(`
        id,
        staff_name,
        staff_code,
        shop_id,
        shops (
          id,
          name,
          location,
          database_name,
          is_active
        )
      `)
      .eq("staff_code", cleanCode)
      .maybeSingle();

    if (staffError) {
      setError(staffError.message);
      return;
    }

    const staff = data as StaffRow | null;

    if (!staff) {
      setError("Invalid unique counter ID.");
      return;
    }

    const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

    if (!shop) {
      setError("This counter ID has not been assigned to a shop.");
      return;
    }

    if (!shop.is_active) {
      setError("Assigned shop is inactive.");
      return;
    }

    sessionStorage.setItem("baebe_pending_counter_staff_id", staff.id);
    sessionStorage.setItem("baebe_pending_counter_staff_name", staff.staff_name);
    sessionStorage.setItem("baebe_pending_counter_staff_code", staff.staff_code);
    sessionStorage.setItem("baebe_pending_counter_shop_id", shop.id);
    sessionStorage.setItem("baebe_pending_counter_shop_name", shop.name);
    sessionStorage.setItem("baebe_pending_counter_shop_location", shop.location);
    sessionStorage.setItem("baebe_pending_counter_shop", JSON.stringify(shop));

    setLoading(true);

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/BaebeCounter`,
      },
    });

    if (googleError) {
      setError(googleError.message);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8F5F0] px-4 text-black">
      <section className="w-full max-w-md rounded-[2.5rem] border border-white/70 bg-white/85 p-8 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-[#F8F5F0] shadow-inner">
          <img
            src="/baebe-boo.jpg"
            alt="Baebe Boo"
            className="h-20 w-20 rounded-full object-cover"
          />
        </div>

        <h1 className="text-3xl font-semibold">Baebe Counter Login</h1>

        <p className="mt-3 text-sm leading-6 text-black/50">
          Enter your unique counter ID, then continue with Google.
        </p>

        {error && (
          <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        <input
          value={staffCode}
          onChange={(e) => setStaffCode(e.target.value)}
          placeholder="UNIQUE ID"
          className="mt-6 h-14 w-full rounded-full border border-black/10 bg-white px-5 text-sm font-semibold uppercase outline-none focus:border-black"
        />

        <button
          onClick={loginWithGoogle}
          disabled={loading}
          className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-black text-sm font-semibold text-white disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm">
            <GoogleIcon />
          </span>
          {loading ? "Opening Google..." : "Continue with Google"}
        </button>

        <div className="mt-6 flex items-start gap-3 rounded-3xl bg-black/[0.04] p-4 text-left">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-5 text-black/50">
            Access is locked by unique counter ID, Google email and assigned shop location.
          </p>
        </div>
      </section>
    </main>
  );
}