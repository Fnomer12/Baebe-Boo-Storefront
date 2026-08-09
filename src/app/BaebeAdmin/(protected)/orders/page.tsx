import type { Metadata } from "next";
import OrdersWorkspace from "@/components/admin/OrdersWorkspace";

export const metadata: Metadata = { title: "Orders | Baebe Boo Admin" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  const selectedView = Array.isArray(view) ? view[0] : view;
  return <OrdersWorkspace view={selectedView} />;
}
