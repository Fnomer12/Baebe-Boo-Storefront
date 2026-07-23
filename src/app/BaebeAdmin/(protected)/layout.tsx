import type { ReactNode } from "react";
import AdminWorkspaceShell from "@/components/admin/AdminWorkspaceShell";
import { requireAdmin } from "@/lib/auth";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
