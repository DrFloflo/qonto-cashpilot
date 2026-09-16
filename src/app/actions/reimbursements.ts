"use server";

import { db } from "@/db";
import { expenseReimbursements } from "@/db/schema";
import { eq } from "drizzle-orm";
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

  db.insert(expenseReimbursements)
    .values({
      id,
      collaboratorId: data.collaboratorId,
      transactionId: data.transactionId || null,
      amount: Number(data.amount),
      date: data.date,
      note: data.note?.trim() || null,
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
