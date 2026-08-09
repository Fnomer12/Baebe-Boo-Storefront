import type { Metadata } from "next";
import DashboardWorkspace from "@/components/admin/DashboardWorkspace";

export const metadata: Metadata = { title: "Dashboard | Baebe Boo Admin" };

export default function AdminDashboardPage() {
  return <DashboardWorkspace />;
}
