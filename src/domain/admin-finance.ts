export type ExpenseCategory = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
};

export type Expense = {
  id: string;
  categoryId: string;
  categoryName: string;
  shopId: string | null;
  shopName: string | null;
  amount: number;
  expenseDate: string;
  note: string;
  receiptUrl: string | null;
  createdAt: string;
};

export type ExpenseSummaryRow = {
  categoryId: string;
  categoryName: string;
  month: string | null;
  shopId: string | null;
  shopName: string | null;
  totalAmount: number;
  expenseCount: number;
};
