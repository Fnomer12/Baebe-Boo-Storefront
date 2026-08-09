import { notFound, redirect } from "next/navigation";

const legacyRedirects: Record<string, string> = {
  upload: "/BaebeAdmin/upload",
  store: "/BaebeAdmin/products",
  database: "/BaebeAdmin/orders?view=archive",
  notifications: "/BaebeAdmin/orders",
  members: "/BaebeAdmin/customers",
  settings: "/BaebeAdmin/stores",
};

export default async function AdminWorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const redirectTo = legacyRedirects[workspace];
  if (redirectTo) redirect(redirectTo);
  notFound();
}
