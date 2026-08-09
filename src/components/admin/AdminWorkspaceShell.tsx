"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { adminWorkspaceRoutes, adminWorkspaceTabFromPathname } from "@/lib/admin-workspace";

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
    <div className="admin-shell">
      <button
        type="button"
        aria-label="Open admin navigation"
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen(true)}
        className="admin-menu-button"
      >
        <Menu size={20} />
      </button>

      {navigationOpen && (
        <button
          type="button"
          aria-label="Close admin navigation"
          onClick={() => setNavigationOpen(false)}
          className="admin-sidebar-backdrop"
        />
      )}

      {/*
        `data-navigation-open` rather than `aria-hidden`.

        `aria-hidden={!navigationOpen}` was applied unconditionally, but at
        >=1024px the CSS forces the sidebar visible — so on every desktop the
        whole navigation was on screen and simultaneously removed from the
        accessibility tree. The counter shell already solved this by driving
        `visibility` from a data attribute, which takes the element out of the
        accessibility tree AND the tab order together, and only while it really
        is off-screen. This is that fix, applied to the admin shell too.
      */}
      <aside
        aria-label="Admin workspace navigation"
        data-navigation-open={navigationOpen ? "true" : "false"}
        className="admin-sidebar"
      >
        <div className="admin-sidebar-brand">
          <div>
            <span>Baebe Boo</span>
            <small>Admin workspace</small>
          </div>
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setNavigationOpen(false)}
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)] lg:hidden"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {adminWorkspaceRoutes.map(({ tab, label, href, icon: Icon }) => {
            const active = tab === activeTab;
            return (
              <Link
                key={tab}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavigationOpen(false)}
              >
                <span className="admin-nav-icon">
                  <Icon size={18} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-badge">
            <ShieldCheck size={16} />
            Protected workspace
          </div>
          <button type="button" onClick={logout} className="admin-sidebar-logout">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
