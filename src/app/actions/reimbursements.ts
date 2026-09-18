"use server";

import { db } from "@/db";
import { expenseReimbursements, transactions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface ReimbursementInput {
  collaboratorId: string;
  transactionId?: string | null;
  amount: number;
  date: string;
  note?: string;
}

export async function createReimbursementAction(data: ReimbursementInput) {
  const id = `reimb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const amount = Math.round(Math.max(0, Number(data.amount)) * 100) / 100;
  if (amount <= 0) throw new Error("Le montant du remboursement doit être positif.");

  if (data.transactionId) {
    const transaction = db.select().from(transactions)
      .where(and(eq(transactions.id, data.transactionId), eq(transactions.side, "debit")))
      .all()[0];
    if (!transaction) throw new Error("La transaction de remboursement doit être un débit bancaire existant.");
    const existingLink = db.select().from(expenseReimbursements)
      .where(eq(expenseReimbursements.transactionId, data.transactionId))
      .all()[0];
    if (existingLink) throw new Error("Cette transaction est déjà liée à un remboursement.");
  }

  db.insert(expenseReimbursements)
    .values({
      id,
      collaboratorId: data.collaboratorId,
      transactionId: data.transactionId || null,
      amount,
      date: data.date,
      note: data.note?.trim() || null,
      status: "settled",
      createdAt: new Date().toISOString(),
    })
    .run();

  revalidatePath("/");
  return { success: true };
}

export async function deleteReimbursementAction(id: string) {
  db.delete(expenseReimbursements).where(eq(expenseReimbursements.id, id)).run();
  revalidatePath("/");
  return { success: true };
}
