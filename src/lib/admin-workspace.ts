import {
  BookOpen,
  ClipboardList,
  Coins,
  LayoutDashboard,
  Package,
  Percent,
  ShoppingCart,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export const adminWorkspaceTabs = [
  "dashboard",
  "products",
  "procurement",
  "finance",
  "promotions",
  "orders",
  "customers",
  "stores",
  "delivery",
  "parenting",
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
    tab: "products",
    label: "Products",
    description: "Catalog and inventory",
    href: "/BaebeAdmin/products",
    icon: Package,
  },
  {
    tab: "procurement",
    label: "Procurement",
    description: "Suppliers and purchase orders",
    href: "/BaebeAdmin/procurement",
    icon: ShoppingCart,
  },
  {
    tab: "finance",
    label: "Finance",
    description: "Expenses and category summary",
    href: "/BaebeAdmin/finance",
    icon: Coins,
  },
  {
    tab: "promotions",
    label: "Promotions",
    description: "Promotions, gift vouchers and loyalty rules",
    href: "/BaebeAdmin/promotions",
    icon: Percent,
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
  {
    tab: "delivery",
    label: "Delivery",
    description: "Delivery zones and fees",
    href: "/BaebeAdmin/delivery",
    icon: Truck,
  },
  {
    tab: "parenting",
    label: "Parenting",
    description: "Parenting Hub articles",
    href: "/BaebeAdmin/parenting",
    icon: BookOpen,
  },
] as const;

export function isAdminWorkspaceTab(value: string): value is AdminWorkspaceTab {
  return adminWorkspaceTabs.some((tab) => tab === value);
}

export function adminWorkspaceTabFromPathname(pathname: string): AdminWorkspaceTab {
  const segment = pathname.split("/").filter(Boolean)[1];
  if (isAdminWorkspaceTab(segment)) return segment;
  return "dashboard";
}
