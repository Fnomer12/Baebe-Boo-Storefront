import { NextResponse } from "next/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { creditLoyaltyPoints } from "@/domain/commerce/rewards";

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "social-share", 1);
  if (!authorization.authorized) return authorization.response;

  const today = new Date().toISOString().slice(0, 10);

  const { error } = await creditLoyaltyPoints(authorization.supabase, {
    userId: authorization.userId,
    eventType: "social_share",
    sourceKey: `social_share:${authorization.userId}:${today}`,
    reason: "Shared Baebe Boo on social media",
    metadata: { shared_at: today },
  });

  if (error) {
    return NextResponse.json(
      { message: "Reward could not be credited. You may have already shared today." },
      { status: 409 },
    );
  }

  return NextResponse.json({ credited: true }, { status: 201 });
}
