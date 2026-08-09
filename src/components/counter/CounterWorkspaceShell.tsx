"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Store, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  counterWorkspaceRoutes,
  counterWorkspaceTabFromPathname,
} from "@/lib/counter-workspace";

/**
 * Display strings only.
 *
 * The shell deliberately cannot be handed a shop id or a staff id. Every
 * counter request derives both from the server session, so there is nothing
 * here for a tampered browser to change.
 */
export type CounterShellIdentity = {
  staffName: string;
  staffCode: string;
  shopName: string;
  shopLocation: string;
};

export default function CounterWorkspaceShell({
  identity,
  children,
}: {
  identity: CounterShellIdentity;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const activeTab = counterWorkspaceTabFromPathname(pathname);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/BaebeCounter/login");
  };

  return (
    <div className="admin-shell counter-shell">
      <button
        type="button"
        aria-label="Open counter navigation"
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen(true)}
        className="admin-menu-button"
      >
        <Menu size={20} />
      </button>

      {navigationOpen && (
        <button
          type="button"
          aria-label="Close counter navigation"
          onClick={() => setNavigationOpen(false)}
          className="admin-sidebar-backdrop"
        />
      )}

      {/*
        Drawer state drives CSS `visibility`, not `aria-hidden`.
        `aria-hidden` would also apply on desktop, where this sidebar is
        permanently visible and interactive — hiding the primary navigation
        from assistive technology and leaving focusable links inside an
        aria-hidden subtree. `visibility:hidden` collapses out of both the
        accessibility tree and the tab order only while the drawer is closed
        on small screens, and the desktop media query restores it.
      */}
      <aside
        data-navigation-open={navigationOpen ? "true" : "false"}
        className="admin-sidebar"
      >
        <div className="admin-sidebar-brand">
          <div>
            <span>Baebe Boo</span>
            <small>Counter · {identity.shopName}</small>
          </div>
          <button
            type="button"
            aria-label="Close counter navigation"
            onClick={() => setNavigationOpen(false)}
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)] lg:hidden"
          >
            <X size={17} />
          </button>
        </div>

        <nav aria-label="Counter workspace navigation" className="admin-sidebar-nav">
          {counterWorkspaceRoutes.map(({ tab, label, href, icon: Icon }) => {
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
            <Store size={16} />
            <span className="min-w-0">
              {identity.staffName}
              <small className="block font-semibold text-[var(--color-ink-soft)]">
                {identity.staffCode}
                {identity.shopLocation ? ` · ${identity.shopLocation}` : ""}
              </small>
            </span>
          </div>
          <button type="button" onClick={logout} className="admin-sidebar-logout">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}
