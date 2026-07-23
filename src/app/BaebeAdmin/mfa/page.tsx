import { redirect } from "next/navigation";
import { getAdminAuthorization } from "@/lib/auth";

export default async function AdminMfaPage() {
  // MFA is temporarily disabled for the admin portal. Keep the route around
  // so re-enabling the challenge later is a one-line policy change.
  const authorization = await getAdminAuthorization();
  if (!authorization) redirect("/BaebeAdmin/login");
  redirect("/BaebeAdmin");
}
