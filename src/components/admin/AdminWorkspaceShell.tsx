"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  adminWorkspaceRoutes,
  adminWorkspaceTabFromPathname,
} from "@/lib/admin-workspace";

export default function AdminWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const activeTab = adminWorkspaceTabFromPathname(pathname);

  const logout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("baebe_admin_auth");
    sessionStorage.removeItem("baebe_admin_role");
    router.replace("/BaebeAdmin/login");
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#17202a] lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <button
        type="button"
        aria-label="Open admin navigation"
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen(true)}
        className="fixed left-4 top-4 z-40 grid h-11 w-11 place-items-center rounded-2xl bg-[#101820] text-white shadow-lg lg:hidden"
      >
        <Menu size={20} />
      </button>

      {navigationOpen && (
        <button
          type="button"
          aria-label="Close admin navigation"
          onClick={() => setNavigationOpen(false)}
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        aria-label="Admin workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col overflow-y-auto bg-[#101820] px-4 py-5 text-white shadow-2xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${
          navigationOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-2">
          <div>
            <Link href="/BaebeAdmin" onClick={() => setNavigationOpen(false)} className="text-xl font-semibold">
              Baebe Boo Admin
            </Link>
            <p className="mt-1 text-xs text-white/55">Commerce operations workspace</p>
          </div>
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setNavigationOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="mt-8 space-y-1.5">
          {adminWorkspaceRoutes.map(({ tab, label, description, href, icon: Icon }) => {
            const active = tab === activeTab;
            return (
              <Link
                key={tab}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavigationOpen(false)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 transition ${
                  active
                    ? "bg-white text-[#101820] shadow-sm"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-[#dff3ff]" : "bg-white/10"}`}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm">{label}</strong>
                  <small className={`mt-0.5 block truncate text-[11px] ${active ? "text-black/50" : "text-white/40"}`}>
                    {description}
                  </small>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-7">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={17} />
              Protected workspace
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">
              Role checks, audit trails and protected operations.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-[#101820]"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mx-auto min-h-screen max-w-[100rem] px-4 pb-10 pt-20 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </section>
    </main>
  );
}
