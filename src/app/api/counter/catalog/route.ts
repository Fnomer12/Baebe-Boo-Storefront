import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { listCounterCatalog } from "@/lib/counter/catalog";
import { CounterError } from "@/lib/counter/errors";

export async function GET() {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  try {
    const items = await listCounterCatalog(authorization.counter.staff.shop.id);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof CounterError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "The catalogue could not be loaded." }, { status: 500 });
  }
}
