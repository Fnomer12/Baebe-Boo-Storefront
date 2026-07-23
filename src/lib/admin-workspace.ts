import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export const adminWorkspaceTabs = [
  "dashboard",
  "products",
  "orders",
  "customers",
  "stores",
] as const;

export type AdminWorkspaceTab = (typeof adminWorkspaceTabs)[number];

export const adminWorkspaceSections = [
  "dashboard",
  "upload",
  "store",
  "products",
  "orders",
  "database",
  "notifications",
  "members",
  "customers",
  "settings",
  "stores",
] as const;

export type AdminWorkspaceSection = (typeof adminWorkspaceSections)[number];

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
    tab: "products",
    label: "Products",
    description: "Catalog and inventory",
    href: "/BaebeAdmin/products",
    icon: Package,
  },
  {
    tab: "orders",
    label: "Orders",
    description: "Fulfilment queue",
    href: "/BaebeAdmin/orders",
    icon: ClipboardList,
  },
  {
    tab: "customers",
    label: "Customers",
    description: "Customer profiles",
    href: "/BaebeAdmin/customers",
    icon: Users,
  },
  {
    tab: "stores",
    label: "Stores",
    description: "Branches and team",
    href: "/BaebeAdmin/stores",
    icon: Store,
  },
] as const;

export function isAdminWorkspaceTab(value: string): value is AdminWorkspaceTab {
  return adminWorkspaceTabs.some((tab) => tab === value);
}

export function isAdminWorkspaceSection(value: string): value is AdminWorkspaceSection {
  return adminWorkspaceSections.some((section) => section === value);
}

export function adminWorkspaceHref(section: AdminWorkspaceSection) {
  switch (section) {
    case "upload":
      return "/BaebeAdmin/upload";
    case "store":
    case "products":
      return "/BaebeAdmin/products";
    case "database":
      return "/BaebeAdmin/orders?view=archive";
    case "notifications":
      return "/BaebeAdmin/orders";
    case "members":
    case "customers":
      return "/BaebeAdmin/customers";
    case "settings":
    case "stores":
      return "/BaebeAdmin/stores";
    case "orders":
      return "/BaebeAdmin/orders";
    default:
      return "/BaebeAdmin";
  }
}

export function adminWorkspaceTabFromPathname(pathname: string): AdminWorkspaceTab {
  const segment = pathname.split("/").filter(Boolean)[1];
  switch (segment) {
    case "upload":
    case "store":
    case "products":
      return "products";
    case "database":
    case "notifications":
    case "orders":
      return "orders";
    case "members":
    case "customers":
      return "customers";
    case "settings":
    case "stores":
      return "stores";
    default:
      return "dashboard";
  }
}
