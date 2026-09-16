"use server";

import { db } from "@/db";
import { futureFlows } from "@/db/schema";
import { getDashboardData } from "@/lib/calculations";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface FutureFlowInput {
  label: string;
  type: "inflow" | "outflow";
  category: string;
  amountHt: number;
  vatRate: number;
  date: string;
  recurrence: "none" | "monthly" | "quarterly" | "yearly";
}

async function refreshDashboard() {
  const updatedData = await getDashboardData();
  revalidatePath("/");
  return { success: true, updatedData };
}

export async function createFutureFlowAction(data: FutureFlowInput) {
  const nowIso = new Date().toISOString();
  const id = `flow-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  db.insert(futureFlows)
    .values({
      id,
      label: data.label.trim(),
      type: data.type,
      category: data.category,
      amountHt: Number(data.amountHt),
      vatRate: Number(data.vatRate),
      date: data.date,
      recurrence: data.recurrence,
      origin: "manual",
      enabled: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();

  return refreshDashboard();
}

export async function updateFutureFlowAction(id: string, data: FutureFlowInput) {
  db.update(futureFlows)
    .set({
      label: data.label.trim(),
      type: data.type,
      category: data.category,
      amountHt: Number(data.amountHt),
      vatRate: Number(data.vatRate),
      date: data.date,
      recurrence: data.recurrence,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(futureFlows.id, id))
    .run();

  return refreshDashboard();
}

export async function toggleFutureFlowAction(id: string, enabled: boolean) {
  db.update(futureFlows)
    .set({ enabled: Boolean(enabled), updatedAt: new Date().toISOString() })
    .where(eq(futureFlows.id, id))
    .run();

  return refreshDashboard();
}

export async function deleteFutureFlowAction(id: string) {
  db.delete(futureFlows).where(eq(futureFlows.id, id)).run();
  return refreshDashboard();
}
