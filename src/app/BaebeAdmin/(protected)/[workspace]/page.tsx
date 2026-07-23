import { notFound, redirect } from "next/navigation";
import {
  isAdminWorkspaceSection,
  type AdminWorkspaceSection,
} from "@/lib/admin-workspace";
import BaebeAdminPage from "../page";

export default async function AdminWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { workspace } = await params;
  if (workspace === "notifications") redirect("/BaebeAdmin/orders");
  if (!isAdminWorkspaceSection(workspace) || workspace === "dashboard" || workspace === "products") notFound();
  const { view } = await searchParams;
  const selectedView = Array.isArray(view) ? view[0] : view;
  const section: AdminWorkspaceSection =
    workspace === "orders" && selectedView === "archive"
      ? "database"
      : workspace === "orders" && selectedView === "notifications"
        ? "orders"
        : workspace === "customers"
          ? "members"
          : workspace === "stores"
            ? "settings"
            : workspace;

  return <BaebeAdminPage initialTab={section} />;
}
