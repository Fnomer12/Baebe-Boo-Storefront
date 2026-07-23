import { notFound } from "next/navigation";
import {
  isAdminWorkspaceTab,
  type AdminWorkspaceTab,
} from "@/lib/admin-workspace";
import BaebeAdminPage from "../page";

export default async function AdminWorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  if (!isAdminWorkspaceTab(workspace) || workspace === "dashboard") notFound();

  return <BaebeAdminPage initialTab={workspace as AdminWorkspaceTab} />;
}
