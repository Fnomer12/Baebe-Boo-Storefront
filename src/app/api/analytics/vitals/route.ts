import { NextResponse } from "next/server";
import { z } from "zod";

const vitalSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(50),
  value: z.number().finite(),
  rating: z.string().max(30).optional(),
  path: z.string().max(500),
});

export async function POST(request: Request) {
  const parsed = vitalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ received: false }, { status: 400 });

  console.info(JSON.stringify({ event: "web_vital", ...parsed.data }));
  return NextResponse.json({ received: true }, { status: 202 });
}
