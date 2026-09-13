# Shared layouts

## AdminWorkspaceShell
- Source: `src/components/admin/AdminWorkspaceShell.tsx`
- Description: Protected admin shell with responsive sidebar, mobile navigation, active route state, and sign-out.

```tsx
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
      <button type="button" aria-label="Open admin navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)} className="admin-menu-button"><Menu size={20} /></button>
      {navigationOpen && <button type="button" aria-label="Close admin navigation" onClick={() => setNavigationOpen(false)} className="admin-sidebar-backdrop" />}
      <aside aria-label="Admin workspace navigation" data-navigation-open={navigationOpen ? "true" : "false"} className="admin-sidebar">
        <div className="admin-sidebar-brand"><div><span>Baebe Boo</span><small>Admin workspace</small></div><button type="button" aria-label="Close admin navigation" onClick={() => setNavigationOpen(false)} className="ml-auto grid h-9 w-9 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)] lg:hidden"><X size={17} /></button></div>
        <nav className="admin-sidebar-nav">
          {adminWorkspaceRoutes.map(({ tab, label, href, icon: Icon }) => { const active = tab === activeTab; return <Link key={tab} href={href} aria-current={active ? "page" : undefined} onClick={() => setNavigationOpen(false)}><span className="admin-nav-icon"><Icon size={18} /></span>{label}</Link>; })}
        </nav>
        <div className="admin-sidebar-footer"><div className="admin-sidebar-badge"><ShieldCheck size={16} />Protected workspace</div><button type="button" onClick={logout} className="admin-sidebar-logout"><LogOut size={16} />Sign out</button></div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
```

## ProtectedAdminLayout
- Source: `src/app/BaebeAdmin/(protected)/layout.tsx`
- Description: Server layout that requires an admin session before rendering `AdminWorkspaceShell`.

```tsx
import type { ReactNode } from "react";
import AdminWorkspaceShell from "@/components/admin/AdminWorkspaceShell";
import { requireAdmin } from "@/lib/auth";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
```

