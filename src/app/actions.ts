"use server";

import { db } from "@/db";
import { futureFlows, appSettings } from "@/db/schema";
import { syncQontoData } from "@/lib/qonto";
import { getDashboardData } from "@/lib/calculations";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function fetchDashboardDataAction() {
  return await getDashboardData();
}

export async function saveSettingsAction(data: {
  fiscalYearEndDay: number;
  fiscalYearEndMonth: number;
  vatRegime: "normal_monthly" | "normal_quarterly" | "simplified";
  vatPaymentMethod: "debits" | "encaissements";
}) {
  const nowIso = new Date().toISOString();

  db.insert(appSettings)
    .values({
      id: "default",
      fiscalYearEndDay: data.fiscalYearEndDay,
      fiscalYearEndMonth: data.fiscalYearEndMonth,
      vatRegime: data.vatRegime,
      vatPaymentMethod: data.vatPaymentMethod,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        fiscalYearEndDay: data.fiscalYearEndDay,
        fiscalYearEndMonth: data.fiscalYearEndMonth,
        vatRegime: data.vatRegime,
        vatPaymentMethod: data.vatPaymentMethod,
        updatedAt: nowIso,
      },
    })
    .run();

  const updatedData = await getDashboardData();
  revalidatePath("/");
  return { success: true, updatedData };
}

export async function syncAction() {
  const result = await syncQontoData();
  const updatedData = await getDashboardData();
  revalidatePath("/");
  return { ...result, updatedData };
}

export async function createFutureFlowAction(data: {
  label: string;
  type: "inflow" | "outflow";
  category: string;
  amountHt: number;
  vatRate: number;
  date: string;
  recurrence: "none" | "monthly" | "quarterly" | "yearly";
}) {
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
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();

  const updatedData = await getDashboardData();
  revalidatePath("/");
  return { success: true, updatedData };
}

export async function updateFutureFlowAction(
  id: string,
  data: {
    label: string;
    type: "inflow" | "outflow";
    category: string;
    amountHt: number;
    vatRate: number;
    date: string;
    recurrence: "none" | "monthly" | "quarterly" | "yearly";
  }
) {
  const nowIso = new Date().toISOString();

  db.update(futureFlows)
    .set({
      label: data.label.trim(),
      type: data.type,
      category: data.category,
      amountHt: Number(data.amountHt),
      vatRate: Number(data.vatRate),
      date: data.date,
      recurrence: data.recurrence,
      updatedAt: nowIso,
    })
    .where(eq(futureFlows.id, id))
    .run();

  const updatedData = await getDashboardData();
  revalidatePath("/");
  return { success: true, updatedData };
}

export async function deleteFutureFlowAction(id: string) {
  db.delete(futureFlows)
    .where(eq(futureFlows.id, id))
    .run();

  const updatedData = await getDashboardData();
  revalidatePath("/");
  return { success: true, updatedData };
}
