"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AccountSignOut() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.replace("/");
        router.refresh();
      }}
      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold"
    >
      <LogOut size={16} /> Sign out
    </button>
  );
}
