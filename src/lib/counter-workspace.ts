import {
  Boxes,
  PackageCheck,
  ReceiptText,
  ScanLine,
  type LucideIcon,
} from "lucide-react";

export const counterWorkspaceTabs = ["sell", "orders", "sales", "stock"] as const;

export type CounterWorkspaceTab = (typeof counterWorkspaceTabs)[number];

export type CounterWorkspaceRoute = {
  tab: CounterWorkspaceTab;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const counterWorkspaceRoutes: readonly CounterWorkspaceRoute[] = [
  {
    tab: "sell",
    label: "Sell",
    description: "Ring up a walk-in sale",
    href: "/BaebeCounter",
    icon: ScanLine,
  },
  {
    tab: "orders",
    label: "Orders",
    description: "Online orders waiting for collection",
    href: "/BaebeCounter/orders",
    icon: PackageCheck,
  },
  {
    tab: "sales",
    label: "Sales",
    description: "Today's takings and receipts",
    href: "/BaebeCounter/sales",
    icon: ReceiptText,
  },
  {
    tab: "stock",
    label: "Stock",
    description: "What is on the shelf right now",
    href: "/BaebeCounter/stock",
    icon: Boxes,
  },
] as const;

export function isCounterWorkspaceTab(value: string): value is CounterWorkspaceTab {
  return counterWorkspaceTabs.some((tab) => tab === value);
}

export function counterWorkspaceTabFromPathname(pathname: string): CounterWorkspaceTab {
  const segment = pathname.split("/").filter(Boolean)[1];
  if (segment && isCounterWorkspaceTab(segment)) return segment;
  return "sell";
}
