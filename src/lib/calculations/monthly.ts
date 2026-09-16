import type { Transaction } from "@/db/schema";
import { endOfMonth, isAfter, isBefore, parseISO, startOfMonth } from "date-fns";

interface MonthlyTransactionSummary {
  revenue: number;
  expenses: number;
  revenueItems: Transaction[];
  expenseItems: Transaction[];
}

export function calculateMonthlyTransactions(
  transactions: Transaction[],
  now: Date,
): MonthlyTransactionSummary {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const summary: MonthlyTransactionSummary = {
    revenue: 0,
    expenses: 0,
    revenueItems: [],
    expenseItems: [],
  };

  for (const transaction of transactions) {
    const transactionDate = parseISO(transaction.settledAt);
    if (isBefore(transactionDate, monthStart) || isAfter(transactionDate, monthEnd)) continue;

    if (transaction.side === "credit" || transaction.amount > 0) {
      summary.revenue += Math.abs(transaction.amount);
      summary.revenueItems.push(transaction);
    } else {
      summary.expenses += Math.abs(transaction.amount);
      summary.expenseItems.push(transaction);
    }
  }

  summary.revenueItems.sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  summary.expenseItems.sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  return summary;
}
