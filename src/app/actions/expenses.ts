"use server";

import { db } from "@/db";
import {
  collaborators,
  expenseItems,
  expenseReimbursements,
  transactions,
} from "@/db/schema";
import { getDashboardData } from "@/lib/calculations";
import { calculateExpenseAmounts } from "@/lib/expense-calculations";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface ExpenseItemInput {
  collaboratorId: string;
  type: "ndf" | "ik";
  date: string;
  label: string;
  amountTtc?: number;
  vatRate?: number;
  prorataRate?: number;
  distanceKm?: number;
}

function getMileageRate(collaboratorId: string) {
  return db
    .select({ mileageRate: collaborators.mileageRate })
    .from(collaborators)
    .where(eq(collaborators.id, collaboratorId))
    .all()[0]?.mileageRate ?? 0.603;
}

async function refreshDashboard() {
  revalidatePath("/");
  return getDashboardData();
}

export async function getExpenseDataAction() {
  const allCollaborators = db.select().from(collaborators).all();
  const allExpenses = db.select().from(expenseItems).all();
  const allReimbursements = db.select().from(expenseReimbursements).all();
  const allTransactions = db.select().from(transactions).all();
  const linkedTransactionIds = new Set(
    allReimbursements
      .map((reimbursement) => reimbursement.transactionId)
      .filter((id): id is string => Boolean(id)),
  );
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoDate = oneYearAgo.toISOString().slice(0, 10);

  const debitTransactions = allTransactions
    .filter((transaction) => {
      const isDebit = transaction.side === "debit" || transaction.amount < 0;
      const hasVat = (transaction.vatAmount ?? 0) > 0;
      const transactionDate = transaction.settledAt.slice(0, 10);

      return isDebit
        && !linkedTransactionIds.has(transaction.id)
        && !hasVat
        && transactionDate >= oneYearAgoDate;
    })
    .map((transaction) => ({
      id: transaction.id,
      label: transaction.label,
      amount: Math.abs(transaction.amount),
      settledAt: transaction.settledAt,
    }))
    .sort((a, b) => b.settledAt.localeCompare(a.settledAt));

  return {
    collaborators: allCollaborators,
    expenses: allExpenses.sort((a, b) => b.date.localeCompare(a.date)),
    reimbursements: allReimbursements.sort((a, b) => b.date.localeCompare(a.date)),
    debitTransactions,
  };
}

export async function createExpenseItemAction(data: ExpenseItemInput) {
  const nowIso = new Date().toISOString();
  const id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const amounts = calculateExpenseAmounts(data, getMileageRate(data.collaboratorId));

  db.insert(expenseItems)
    .values({
      id,
      collaboratorId: data.collaboratorId,
      type: data.type,
      date: data.date,
      label: data.label.trim(),
      ...amounts,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();

  const updatedDashboard = await refreshDashboard();
  return { success: true, updatedDashboard };
}

export async function updateExpenseItemAction(id: string, data: ExpenseItemInput) {
  const amounts = calculateExpenseAmounts(data, getMileageRate(data.collaboratorId));

  db.update(expenseItems)
    .set({
      collaboratorId: data.collaboratorId,
      type: data.type,
      date: data.date,
      label: data.label.trim(),
      ...amounts,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(expenseItems.id, id))
    .run();

  const updatedDashboard = await refreshDashboard();
  return { success: true, updatedDashboard };
}

export async function deleteExpenseItemAction(id: string) {
  db.delete(expenseItems).where(eq(expenseItems.id, id)).run();
  const updatedDashboard = await refreshDashboard();
  return { success: true, updatedDashboard };
}
