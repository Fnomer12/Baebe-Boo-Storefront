"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Plus, Save, Trash2 } from "lucide-react";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminModal,
  AdminSelect,
} from "@/components/admin/AdminWorkspacePrimitives";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import type { Expense, ExpenseCategory, ExpenseSummaryRow } from "@/domain/admin-finance";
import { formatCedis } from "@/domain/money";
import { HintedField } from "@/components/admin/AdminHint";
import { optionalText, requiredNumber, requiredText } from "@/domain/forms/form-values";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function FinanceWorkspace() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummaryRow[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [expensesRes, shopsRes] = await Promise.all([
        fetch(`/api/admin/expenses?year=${year}&month=${month}`),
        fetch("/api/admin/stores"),
      ]);
      const expensesJson = await expensesRes.json().catch(() => ({}));
      const shopsJson = await shopsRes.json().catch(() => ({}));
      if (!expensesRes.ok) throw new Error(expensesJson.message || "Finance data could not be loaded.");
      setCategories(expensesJson.categories || []);
      setExpenses(expensesJson.expenses || []);
      setSummary(expensesJson.summary || []);
      setShops((shopsJson.stores || []).map((s: Record<string, unknown>) => ({ id: String(s.id), name: String(s.name) })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load finance data.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const summaryByCategory = useMemo(() => {
    const map = new Map<string, { categoryName: string; total: number; count: number }>();
    for (const row of summary) {
      const existing = map.get(row.categoryId) || { categoryName: row.categoryName, total: 0, count: 0 };
      existing.total += row.totalAmount;
      existing.count += row.expenseCount;
      map.set(row.categoryId, existing);
    }
    return Array.from(map.entries())
      .map(([categoryId, value]) => ({ categoryId, ...value }))
      .sort((a, b) => b.total - a.total);
  }, [summary]);

  const totalExpenses = useMemo(() => summaryByCategory.reduce((sum, row) => sum + row.total, 0), [summaryByCategory]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    // `String(formData.get(x))` yields the literal string "null" when a field
    // is absent, which is how a renamed input turns into a value the API
    // cheerfully stores. The helpers below cannot do that.
    const payload = {
      categoryId: requiredText(formData.get("categoryId")),
      shopId: optionalText(formData.get("shopId")) ?? null,
      amount: requiredNumber(formData.get("amount")),
      expenseDate: requiredText(formData.get("expenseDate")),
      note: optionalText(formData.get("note")) ?? "",
      receiptUrl: optionalText(formData.get("receiptUrl")) ?? null,
    };

    const response = await fetch("/api/admin/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.message || "Expense could not be saved.");
      return;
    }
    setShowForm(false);
    form.reset();
    await load();
  }

  async function handleDelete(expense: Expense) {
    if (!window.confirm(`Delete this ${formatCedis(expense.amount)} expense?`)) return;
    const response = await fetch(`/api/admin/expenses?id=${expense.id}`, { method: "DELETE" });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.message || "Expense could not be deleted.");
      return;
    }
    await load();
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  if (error) {
    return <AdminErrorState description={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="space-y-6">
      <div className="admin-header">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-brand-deep)" }}>
            Money out
          </p>
          <h1>Finance</h1>
        </div>
        <div className="flex items-center gap-2">
          <AdminSelect value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </AdminSelect>
          <AdminSelect value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => 2024 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </AdminSelect>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="admin-button px-4 py-2 text-sm"
          >
            <Plus size={16} /> Add expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Total expenses</span>
          <strong>{formatCedis(totalExpenses)}</strong>
        </div>
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Transactions</span>
          <strong>{expenses.length}</strong>
        </div>
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Categories</span>
          <strong>{summaryByCategory.length}</strong>
        </div>
        <div className="admin-card admin-card-padding admin-stat-card">
          <span>Top category</span>
          <strong>{summaryByCategory[0]?.categoryName || "—"}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="admin-card admin-card-padding">
          <div className="mb-4 flex items-center gap-2">
            <Coins size={18} style={{ color: "var(--color-brand-deep)" }} />
            <h2 className="text-lg font-semibold">Expenses by category</h2>
          </div>
          {summaryByCategory.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>No expenses recorded for this period.</p>
          ) : (
            <ul className="space-y-3">
              {summaryByCategory.map((row) => (
                <li key={row.categoryId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold">{row.categoryName}</span>
                    <span style={{ color: "var(--color-ink-soft)" }}>{formatCedis(row.total)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full" style={{ background: "var(--color-cream)" }}>
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${totalExpenses > 0 ? Math.round((row.total / totalExpenses) * 100) : 0}%`,
                        background: "var(--color-brand)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-ink-soft)" }}>{row.count} transaction(s)</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-card admin-card-padding">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent transactions</h2>
            <ExportCsvButton href={`/api/admin/reports/export?report=expenses&year=${year}&month=${month}`} />
          </div>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--color-cream)]" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <AdminEmptyState
              title="No expenses"
              description="Record rent, salaries, utilities, fuel, delivery, and other expenses here."
              icon={<Coins size={24} />}
              action={
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="admin-button px-4 py-2 text-sm"
                >
                  <Plus size={16} /> Add expense
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-cream)] p-3"
                >
                  <div>
                    <p className="font-semibold">{expense.categoryName}</p>
                    <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>
                      {formatDate(expense.expenseDate)} {expense.shopName ? `· ${expense.shopName}` : ""}
                    </p>
                    {expense.note && (
                      <p className="mt-1 text-xs" style={{ color: "var(--color-ink-soft)", opacity: 0.75 }}>{expense.note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCedis(expense.amount)}</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(expense)}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AdminModal open={showForm} onClose={() => setShowForm(false)} title="Add expense" subtitle="Expense">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/*
            HintedField rather than wrapping each control in its own <label>:
            the hint trigger is a real button, and a button inside a label
            inherits the label's activation behaviour, so tapping "what is
            this?" would also focus the field underneath it.
          */}
          <HintedField
            label="Category"
            htmlFor="expense-category"
            required
            hint="What kind of cost this is — rent, transport, packaging. Categories are what the profit report groups your spending by, so pick the closest one rather than leaving it on the first."
          >
            <AdminSelect id="expense-category" name="categoryId" required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </AdminSelect>
          </HintedField>
          <HintedField
            label="Branch"
            htmlFor="expense-shop"
            hint="Which shop paid for this. Leave it on “All / Head office” for costs that are not tied to one branch, like a bank charge."
          >
            <AdminSelect id="expense-shop" name="shopId">
              <option value="">All / Head office</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </AdminSelect>
          </HintedField>
          <HintedField
            label="Amount (GH₵)"
            htmlFor="expense-amount"
            required
            hint="What you actually paid, in cedis. This is subtracted from your sales to work out profit."
          >
            <input id="expense-amount" name="amount" type="number" min={0} step={0.01} className="admin-input" required />
          </HintedField>
          <HintedField
            label="Date"
            htmlFor="expense-date"
            required
            hint="The day the money left the business, not the day you are typing this in. It decides which month the cost lands in."
          >
            <input
              id="expense-date"
              name="expenseDate"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="admin-input"
              required
            />
          </HintedField>
          <HintedField
            label="Note"
            htmlFor="expense-note"
            hint="Anything the number alone will not tell you in six months — who was paid, what for, which invoice."
          >
            <textarea id="expense-note" name="note" className="admin-input min-h-[5rem] py-3" />
          </HintedField>
          <HintedField
            label="Receipt link"
            htmlFor="expense-receipt"
            hint="A web link to a photo or scan of the receipt, if you have one stored somewhere. Leave it blank otherwise — it is not required."
          >
            <input id="expense-receipt" name="receiptUrl" type="url" className="admin-input" />
          </HintedField>
          <button type="submit" className="admin-button h-12 w-full">
            <Save size={18} /> Save expense
          </button>
        </form>
      </AdminModal>
    </div>
  );
}
