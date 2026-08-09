import { redirect } from "next/navigation";

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const referralCode = code?.trim();

  if (!referralCode) {
    redirect("/account/login");
  }

  redirect(`/api/ref/${encodeURIComponent(referralCode)}`);
}
