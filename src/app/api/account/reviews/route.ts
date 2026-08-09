import { NextResponse } from "next/server";
import { authorizeCustomerMutation } from "@/lib/account/customer-api";
import { verifiedReviewSchema } from "@/lib/account/customer-workflows";
import { creditLoyaltyPoints } from "@/domain/commerce/rewards";

export async function POST(request: Request) {
  const authorization = await authorizeCustomerMutation(request, "verified-review", 3);
  if (!authorization.authorized) return authorization.response;

  const input = verifiedReviewSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ message: "Check the review details and try again." }, { status: 400 });
  }

  const { data, error } = await authorization.supabase.rpc("submit_verified_review", {
    p_order_id: input.data.orderId,
    p_product_id: input.data.productId,
    p_rating: input.data.rating,
    p_title: input.data.title ?? "",
    p_body: input.data.body,
  });

  if (error || !data) {
    return NextResponse.json(
      { message: "A delivered purchase is required, and each item can be reviewed once." },
      { status: 409 },
    );
  }

  await creditLoyaltyPoints(authorization.supabase, {
    userId: authorization.userId,
    eventType: "review",
    sourceKey: `review:${authorization.userId}:${data}`,
    reason: "Verified purchase review",
    orderId: input.data.orderId,
    metadata: { product_id: input.data.productId, rating: input.data.rating },
  });

  return NextResponse.json({ id: data, status: "pending" }, { status: 201 });
}
