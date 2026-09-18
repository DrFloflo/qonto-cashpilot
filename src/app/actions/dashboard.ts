 "use server";

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getDashboardData } from "@/lib/calculations";
import { syncQontoData } from "@/lib/qonto";
import { revalidatePath } from "next/cache";

interface SettingsInput {
  fiscalYearEndDay: number;
  fiscalYearEndMonth: number;
  vatRegime: "normal_monthly" | "normal_quarterly" | "simplified";
  vatPaymentMethod: "debits" | "encaissements";
  fixedAssetThresholdCents?: number;
}

export async function fetchDashboardDataAction() {
  return getDashboardData();
}

export async function saveSettingsAction(data: SettingsInput) {
  const nowIso = new Date().toISOString();
  const settings = {
    fiscalYearEndDay: data.fiscalYearEndDay,
    fiscalYearEndMonth: data.fiscalYearEndMonth,
    vatRegime: data.vatRegime,
    vatPaymentMethod: data.vatPaymentMethod,
    fixedAssetThresholdCents: data.fixedAssetThresholdCents ?? 50000,
    updatedAt: nowIso,
  };

  db.insert(appSettings)
    .values({ id: "default", ...settings })
    .onConflictDoUpdate({ target: appSettings.id, set: settings })
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
