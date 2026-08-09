import { cookies } from "next/headers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const referralCode = code?.trim();

  if (referralCode) {
    const cookieStore = await cookies();
    cookieStore.set("referral_code", referralCode, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return new Response(null, {
    status: 307,
    headers: { Location: "/account/login" },
  });
}
