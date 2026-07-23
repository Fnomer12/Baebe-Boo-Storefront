import {
  Bell,
  ClipboardList,
  Database,
  LayoutDashboard,
  Settings,
  Store,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

export const adminWorkspaceTabs = [
  "dashboard",
  "upload",
  "store",
  "orders",
  "database",
  "notifications",
  "members",
  "settings",
] as const;

export type AdminWorkspaceTab = (typeof adminWorkspaceTabs)[number];

export type AdminWorkspaceRoute = {
  tab: AdminWorkspaceTab;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const adminWorkspaceRoutes: readonly AdminWorkspaceRoute[] = [
  {
    tab: "dashboard",
    label: "Dashboard",
    description: "Business overview",
    href: "/BaebeAdmin",
    icon: LayoutDashboard,
  },
  {
    tab: "upload",
    label: "Upload",
    description: "Add a product",
    href: "/BaebeAdmin/upload",
    icon: Upload,
  },
  {
    tab: "store",
    label: "Store",
    description: "Catalog and inventory",
    href: "/BaebeAdmin/store",
    icon: Store,
  },
  {
    tab: "orders",
    label: "Orders",
    description: "Fulfilment queue",
    href: "/BaebeAdmin/orders",
    icon: ClipboardList,
  },
  {
    tab: "database",
    label: "Database",
    description: "Completed records",
    href: "/BaebeAdmin/database",
    icon: Database,
  },
  {
    tab: "notifications",
    label: "Notifications",
    description: "Attention needed",
    href: "/BaebeAdmin/notifications",
    icon: Bell,
  },
  {
    tab: "members",
    label: "Members",
    description: "Family directory",
    href: "/BaebeAdmin/members",
    icon: Users,
  },
  {
    tab: "settings",
    label: "Settings",
    description: "Branches and staff",
    href: "/BaebeAdmin/settings",
    icon: Settings,
  },
] as const;

export function isAdminWorkspaceTab(value: string): value is AdminWorkspaceTab {
  return adminWorkspaceTabs.some((tab) => tab === value);
}

export function adminWorkspaceHref(tab: AdminWorkspaceTab) {
  return adminWorkspaceRoutes.find((route) => route.tab === tab)?.href ?? "/BaebeAdmin";
}

export function adminWorkspaceTabFromPathname(pathname: string): AdminWorkspaceTab {
  const segment = pathname.split("/").filter(Boolean)[1];
  return segment && isAdminWorkspaceTab(segment) ? segment : "dashboard";
}
