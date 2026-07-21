import { redirect } from "next/navigation";
import { getAdminAuthorization } from "@/lib/auth";
import AdminMfa from "@/components/AdminMfa";

export default async function AdminMfaPage() {
  const authorization = await getAdminAuthorization();
  if (!authorization) redirect("/BaebeAdmin/login");
  if (authorization.assurance.currentLevel === "aal2") redirect("/BaebeAdmin");

  return <AdminMfa />;
}
