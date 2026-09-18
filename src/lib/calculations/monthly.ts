import type { Transaction } from "@/db/schema";
import { endOfMonth, isAfter, isBefore, parseISO, startOfMonth } from "date-fns";

interface MonthlyTransactionSummary {
  inflows: number;
  outflows: number;
  inflowItems: Transaction[];
  outflowItems: Transaction[];
}

export function calculateMonthlyTransactions(
  transactions: Transaction[],
  now: Date,
): MonthlyTransactionSummary {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const summary: MonthlyTransactionSummary = {
    inflows: 0,
    outflows: 0,
    inflowItems: [],
    outflowItems: [],
  };

  for (const transaction of transactions) {
    const transactionDate = parseISO(transaction.settledAt);
    if (isBefore(transactionDate, monthStart) || isAfter(transactionDate, monthEnd)) continue;

    if (transaction.side === "credit" || transaction.amount > 0) {
      summary.inflows += Math.abs(transaction.amount);
      summary.inflowItems.push(transaction);
    } else {
      summary.outflows += Math.abs(transaction.amount);
      summary.outflowItems.push(transaction);
    }
  }

  summary.inflowItems.sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  summary.outflowItems.sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  return summary;
}
