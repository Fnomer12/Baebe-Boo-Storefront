import { NextResponse } from "next/server";
import { authorizeCounterApi } from "@/lib/auth";
import { CounterError } from "@/lib/counter/errors";
import { listCounterSales, recordCounterSale } from "@/lib/counter/sales";
import { refreshProfitReports } from "@/lib/admin/refresh-reports";
import {
  counterSaleCreateSchema,
  counterSalesQuerySchema,
} from "@/lib/counter/counter-schemas";

function counterError(error: unknown, fallback: string) {
  if (error instanceof CounterError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  return NextResponse.json({ message: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const query = counterSalesQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });

  const { staff } = authorization.counter;
  try {
    const digest = await listCounterSales(staff.shop.id, staff.id, {
      limit: query.success ? query.data.limit : 50,
    });
    return NextResponse.json(digest);
  } catch (error) {
    return counterError(error, "Sales could not be loaded.");
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeCounterApi();
  if (!authorization.authorized) return authorization.response;

  const input = counterSaleCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    // Generic text on purpose: zod issue paths would describe the shape of the
    // request to anyone probing the endpoint.
    return NextResponse.json({ message: "Invalid sale details." }, { status: 400 });
  }

  const { staff } = authorization.counter;
  try {
    const sale = await recordCounterSale(staff.shop.id, staff.id, input.data);
    // In-store sales are the reason the dashboard's two revenue figures
    // disagreed: they land in `orders` immediately, but the profit report reads
    // a materialized snapshot that nothing refreshed. Awaited so the owner's
    // dashboard is correct by the time the cashier hands over the receipt, and
    // deliberately not allowed to fail the sale — the money is already taken.
    const { error: reportError } = await refreshProfitReports();
    if (reportError) {
      console.error("counter sale: profit report refresh failed", reportError);
    }
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return counterError(error, "The sale could not be completed.");
  }
}
