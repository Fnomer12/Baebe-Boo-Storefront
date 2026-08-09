import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Expense, ExpenseCategory, ExpenseSummaryRow } from "@/domain/admin-finance";

function normalizeCategory(row: Record<string, unknown>): ExpenseCategory {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ""),
    isActive: row.is_active !== false,
  };
}

function normalizeExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    categoryName: String(row.category_name || "Unknown"),
    shopId: row.shop_id ? String(row.shop_id) : null,
    shopName: row.shop_name ? String(row.shop_name) : null,
    amount: Number(row.amount || 0),
    expenseDate: String(row.expense_date),
    note: String(row.note || ""),
    receiptUrl: row.receipt_url ? String(row.receipt_url) : null,
    createdAt: String(row.created_at || ""),
  };
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabaseAdmin
    .from("expense_categories")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw new Error(error.message);
  return (data || []).map(normalizeCategory);
}

export async function listExpenses(options?: {
  year?: number;
  month?: number;
  categoryId?: string;
}): Promise<Expense[]> {
  let query = supabaseAdmin
    .from("expenses")
    .select("*, expense_categories(name), shops(name)")
    .order("expense_date", { ascending: false });

  if (options?.year && options?.month) {
    const start = new Date(options.year, options.month - 1, 1).toISOString().slice(0, 10);
    const end = new Date(options.year, options.month, 0).toISOString().slice(0, 10);
    query = query.gte("expense_date", start).lte("expense_date", end);
  } else if (options?.year) {
    query = query.gte("expense_date", `${options.year}-01-01`).lte("expense_date", `${options.year}-12-31`);
  }

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const categoryRow = row.expense_categories as Record<string, unknown> | null;
    const shopRow = row.shops as Record<string, unknown> | null;
    return normalizeExpense({
      ...row,
      category_name: categoryRow?.name,
      shop_name: shopRow?.name,
    });
  });
}

export type CreateExpenseInput = {
  categoryId: string;
  shopId?: string | null;
  amount: number;
  expenseDate: string;
  note?: string;
  receiptUrl?: string | null;
};

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      category_id: input.categoryId,
      shop_id: input.shopId || null,
      amount: input.amount,
      expense_date: input.expenseDate,
      note: input.note || null,
      receipt_url: input.receiptUrl || null,
    })
    .select("*, expense_categories(name), shops(name)")
    .single();

  if (error) throw new Error(error.message);
  const categoryRow = data.expense_categories as Record<string, unknown> | null;
  const shopRow = data.shops as Record<string, unknown> | null;
  return normalizeExpense({
    ...data,
    category_name: categoryRow?.name,
    shop_name: shopRow?.name,
  });
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getExpenseSummary(year?: number, month?: number): Promise<ExpenseSummaryRow[]> {
  let query = supabaseAdmin
    .from("expense_summary")
    .select("category_id, category_name, month, shop_id, shop_name, total_amount, expense_count")
    .order("total_amount", { ascending: false });

  if (year && month) {
    const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    query = query.gte("month", start);
  } else if (year) {
    query = query.gte("month", `${year}-01-01`).lte("month", `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    categoryId: String(row.category_id),
    categoryName: String(row.category_name),
    month: row.month ? String(row.month) : null,
    shopId: row.shop_id ? String(row.shop_id) : null,
    shopName: row.shop_name ? String(row.shop_name) : null,
    totalAmount: Number(row.total_amount || 0),
    expenseCount: Number(row.expense_count || 0),
  }));
}
