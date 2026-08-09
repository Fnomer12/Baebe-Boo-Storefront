import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminApi } from "@/lib/auth";
import { createExpense, deleteExpense, getExpenseSummary, listExpenseCategories, listExpenses } from "@/lib/admin/finance";

const createSchema = z.object({
  categoryId: z.string().uuid(),
  shopId: z.string().uuid().optional().nullable(),
  amount: z.number().min(0),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  receiptUrl: z.string().url().optional().nullable(),
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi("orders:read");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
  const categoryId = searchParams.get("categoryId") || undefined;

  try {
    const [categories, expenses, summary] = await Promise.all([
      listExpenseCategories(),
      listExpenses({ year, month, categoryId }),
      getExpenseSummary(year, month),
    ]);
    return NextResponse.json({ categories, expenses, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expenses could not be loaded.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const body = await request.json().catch(() => ({}));
  const parse = createSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ message: "Invalid expense data." }, { status: 400 });
  }

  try {
    const expense = await createExpense(parse.data);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expense could not be created.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeAdminApi("orders:write");
  if (!authorization.authorized) return authorization.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ message: "Expense ID is required." }, { status: 400 });
  }

  try {
    await deleteExpense(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Expense could not be deleted.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
