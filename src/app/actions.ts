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

// ==========================================
// COLLABORATORS ACTIONS
// ==========================================

export async function getCollaboratorsAction() {
  const { collaborators } = await import("@/db/schema");
  return db.select().from(collaborators).all();
}

export async function createCollaboratorAction(data: {
  name: string;
  email?: string;
  mileageRate?: number;
}) {
  const { collaborators } = await import("@/db/schema");
  const nowIso = new Date().toISOString();
  const id = `collab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  db.insert(collaborators)
    .values({
      id,
      name: data.name.trim(),
      email: data.email?.trim() || null,
      mileageRate: data.mileageRate !== undefined && !isNaN(Number(data.mileageRate)) ? Number(data.mileageRate) : 0.603,
      active: true,
      createdAt: nowIso,
    })
    .run();

  revalidatePath("/");
  return { success: true };
}

export async function updateCollaboratorAction(
  id: string,
  data: {
    name: string;
    email?: string;
    mileageRate: number;
    active?: boolean;
  }
) {
  const { collaborators } = await import("@/db/schema");
  db.update(collaborators)
    .set({
      name: data.name.trim(),
      email: data.email?.trim() || null,
      mileageRate: Number(data.mileageRate),
      active: data.active !== undefined ? data.active : true,
    })
    .where(eq(collaborators.id, id))
    .run();

  revalidatePath("/");
  return { success: true };
}

export async function deleteCollaboratorAction(id: string) {
  const { collaborators } = await import("@/db/schema");
  db.delete(collaborators).where(eq(collaborators.id, id)).run();
  revalidatePath("/");
  return { success: true };
}

// ==========================================
// EXPENSE ITEMS ACTIONS
// ==========================================

export async function getExpenseDataAction() {
  const { collaborators, expenseItems, expenseReimbursements, transactions } = await import("@/db/schema");
  const allCollaborators = db.select().from(collaborators).all();
  const allExpenses = db.select().from(expenseItems).all();
  const allReimbursements = db.select().from(expenseReimbursements).all();
  const allTransactions = db.select().from(transactions).all();

  // Set of already linked transaction IDs
  const linkedTransactionIds = new Set(
    allReimbursements
      .map((r) => r.transactionId)
      .filter((id): id is string => Boolean(id))
  );

  // 1 year cutoff date (YYYY-MM-DD)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

  // Transactions eligible for reimbursement:
  // - debits (outflows)
  // - not already linked
  // - no VAT (vatAmount === 0 or null/undefined)
  // - date within the last 1 year (settledAt >= 1 year ago)
  const debitTransactions = allTransactions
    .filter((tx) => {
      const isDebit = tx.side === "debit" || tx.amount < 0;
      if (!isDebit) return false;
      if (linkedTransactionIds.has(tx.id)) return false;

      // No VAT rule: vat_amount is 0, null or undefined
      const vat = tx.vatAmount ?? 0;
      if (vat > 0) return false;

      // 1 year max history rule
      const txDate = tx.settledAt.slice(0, 10);
      if (txDate < oneYearAgoStr) return false;

      return true;
    })
    .map((tx) => ({
      id: tx.id,
      label: tx.label,
      amount: Math.abs(tx.amount),
      settledAt: tx.settledAt,
    }))
    .sort((a, b) => b.settledAt.localeCompare(a.settledAt));

  return {
    collaborators: allCollaborators,
    expenses: allExpenses.sort((a, b) => b.date.localeCompare(a.date)),
    reimbursements: allReimbursements.sort((a, b) => b.date.localeCompare(a.date)),
    debitTransactions,
  };
}

export async function createExpenseItemAction(data: {
  collaboratorId: string;
  type: "ndf" | "ik";
  date: string;
  label: string;
  amountTtc?: number;
  vatRate?: number;
  prorataRate?: number;
  distanceKm?: number;
}) {
  const { expenseItems, collaborators } = await import("@/db/schema");
  const nowIso = new Date().toISOString();
  const id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  let finalAmountTtc = 0;
  let finalAmountHt = 0;
  let finalVatRate = 0;
  let finalProrata = 100;
  let finalVatDeductible = 0;
  let finalReimbursable = 0;
  let distanceKm: number | null = null;

  if (data.type === "ik") {
    const collab = db.select().from(collaborators).where(eq(collaborators.id, data.collaboratorId)).all()[0];
    const rate = collab ? collab.mileageRate : 0.603;
    const km = Number(data.distanceKm) || 0;
    distanceKm = km;
    const computedTotal = Math.round(km * rate * 100) / 100;
    finalAmountTtc = computedTotal;
    finalAmountHt = computedTotal;
    finalVatRate = 0;
    finalProrata = 100;
    finalVatDeductible = 0;
    finalReimbursable = computedTotal;
  } else {
    finalAmountTtc = Number(data.amountTtc) || 0;
    finalVatRate = Number(data.vatRate) || 0;
    finalProrata = data.prorataRate !== undefined ? Number(data.prorataRate) : 100;

    // HT calculation from TTC
    finalAmountHt = Math.round((finalAmountTtc / (1 + finalVatRate / 100)) * 100) / 100;
    // Deductible VAT: (TTC - HT) * (prorata / 100)
    const vatTotal = Math.max(0, Math.round((finalAmountTtc - finalAmountHt) * 100) / 100);
    finalVatDeductible = Math.round(vatTotal * (finalProrata / 100) * 100) / 100;
    // Reimbursable: TTC * (prorata / 100)
    finalReimbursable = Math.round(finalAmountTtc * (finalProrata / 100) * 100) / 100;
  }

  db.insert(expenseItems)
    .values({
      id,
      collaboratorId: data.collaboratorId,
      type: data.type,
      date: data.date,
      label: data.label.trim(),
      amountTtc: finalAmountTtc,
      amountHt: finalAmountHt,
      vatRate: finalVatRate,
      prorataRate: finalProrata,
      vatDeductible: finalVatDeductible,
      reimbursableAmount: finalReimbursable,
      distanceKm,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .run();

  revalidatePath("/");
  const updatedDashboard = await getDashboardData();
  return { success: true, updatedDashboard };
}

export async function updateExpenseItemAction(
  id: string,
  data: {
    collaboratorId: string;
    type: "ndf" | "ik";
    date: string;
    label: string;
    amountTtc?: number;
    vatRate?: number;
    prorataRate?: number;
    distanceKm?: number;
  }
) {
  const { expenseItems, collaborators } = await import("@/db/schema");
  const nowIso = new Date().toISOString();

  let finalAmountTtc = 0;
  let finalAmountHt = 0;
  let finalVatRate = 0;
  let finalProrata = 100;
  let finalVatDeductible = 0;
  let finalReimbursable = 0;
  let distanceKm: number | null = null;

  if (data.type === "ik") {
    const collab = db.select().from(collaborators).where(eq(collaborators.id, data.collaboratorId)).all()[0];
    const rate = collab ? collab.mileageRate : 0.603;
    const km = Number(data.distanceKm) || 0;
    distanceKm = km;
    const computedTotal = Math.round(km * rate * 100) / 100;
    finalAmountTtc = computedTotal;
    finalAmountHt = computedTotal;
    finalVatRate = 0;
    finalProrata = 100;
    finalVatDeductible = 0;
    finalReimbursable = computedTotal;
  } else {
    finalAmountTtc = Number(data.amountTtc) || 0;
    finalVatRate = Number(data.vatRate) || 0;
    finalProrata = data.prorataRate !== undefined ? Number(data.prorataRate) : 100;

    finalAmountHt = Math.round((finalAmountTtc / (1 + finalVatRate / 100)) * 100) / 100;
    const vatTotal = Math.max(0, Math.round((finalAmountTtc - finalAmountHt) * 100) / 100);
    finalVatDeductible = Math.round(vatTotal * (finalProrata / 100) * 100) / 100;
    finalReimbursable = Math.round(finalAmountTtc * (finalProrata / 100) * 100) / 100;
  }

  db.update(expenseItems)
    .set({
      collaboratorId: data.collaboratorId,
      type: data.type,
      date: data.date,
      label: data.label.trim(),
      amountTtc: finalAmountTtc,
      amountHt: finalAmountHt,
      vatRate: finalVatRate,
      prorataRate: finalProrata,
      vatDeductible: finalVatDeductible,
      reimbursableAmount: finalReimbursable,
      distanceKm,
      updatedAt: nowIso,
    })
    .where(eq(expenseItems.id, id))
    .run();

  revalidatePath("/");
  const updatedDashboard = await getDashboardData();
  return { success: true, updatedDashboard };
}

export async function deleteExpenseItemAction(id: string) {
  const { expenseItems } = await import("@/db/schema");
  db.delete(expenseItems).where(eq(expenseItems.id, id)).run();

  revalidatePath("/");
  const updatedDashboard = await getDashboardData();
  return { success: true, updatedDashboard };
}

// ==========================================
// EXPENSE REIMBURSEMENTS (LIAISON VIREMENTS)
// ==========================================

export async function createReimbursementAction(data: {
  collaboratorId: string;
  transactionId?: string | null;
  amount: number;
  date: string;
  note?: string;
}) {
  const { expenseReimbursements } = await import("@/db/schema");
  const nowIso = new Date().toISOString();
  const id = `reimb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  db.insert(expenseReimbursements)
    .values({
      id,
      collaboratorId: data.collaboratorId,
      transactionId: data.transactionId || null,
      amount: Number(data.amount),
      date: data.date,
      note: data.note?.trim() || null,
      createdAt: nowIso,
    })
    .run();

  revalidatePath("/");
  return { success: true };
}

export async function deleteReimbursementAction(id: string) {
  const { expenseReimbursements } = await import("@/db/schema");
  db.delete(expenseReimbursements).where(eq(expenseReimbursements.id, id)).run();
  revalidatePath("/");
  return { success: true };
}

// ==========================================
// IMPORT CSV ACTION
// ==========================================

export async function importExpenseCsvAction(csvContent: string) {
  const { collaborators, expenseItems } = await import("@/db/schema");
  const nowIso = new Date().toISOString();

  // Load existing collaborators
  const existingCollabs = db.select().from(collaborators).all();
  const collabMap = new Map<string, typeof collaborators.$inferSelect>();
  existingCollabs.forEach((c) => {
    collabMap.set(c.name.trim().toLowerCase(), c);
  });

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { success: false, error: "Le fichier CSV est vide ou ne contient pas d'en-tête valide." };
  }

  // Detect delimiter (; or ,)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());

  // Expected columns: date, type, collaborateur, description, montant_ttc, taux_tva, prorata, km
  let importedCount = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim());
    if (cols.length === 0 || cols.every((c) => c === "")) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || "";
    });

    const rawDate = row["date"] || "";
    const rawType = (row["type"] || "").toUpperCase();
    const collabName = row["collaborateur"] || "";
    const desc = row["description"] || row["objet"] || row["label"] || "Dépense";
    const rawTtc = row["montant_ttc"] || row["montant"] || "";
    const rawVat = row["taux_tva"] || row["tva"] || "0";
    const rawProrata = row["prorata"] || "100";
    const rawKm = row["km"] || "";

    if (!collabName) {
      errors.push(`Ligne ${i + 1}: Collaborateur manquant`);
      continue;
    }

    // Parse date (YYYY-MM-DD or DD/MM/YYYY)
    let formattedDate = rawDate;
    if (rawDate.includes("/")) {
      const parts = rawDate.split("/");
      if (parts.length === 3) {
        // DD/MM/YYYY -> YYYY-MM-DD
        formattedDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }

    if (!formattedDate) {
      formattedDate = new Date().toISOString().slice(0, 10);
    }

    // Find or create collaborator
    let collab = collabMap.get(collabName.toLowerCase());
    if (!collab) {
      const newCollabId = `collab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      collab = {
        id: newCollabId,
        name: collabName,
        email: null,
        mileageRate: 0.603,
        active: true,
        createdAt: nowIso,
      };
      db.insert(collaborators).values(collab).run();
      collabMap.set(collabName.toLowerCase(), collab);
    }

    const type = rawType === "IK" ? "ik" : "ndf";
    const id = `exp-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;

    let finalAmountTtc = 0;
    let finalAmountHt = 0;
    let finalVatRate = 0;
    let finalProrata = 100;
    let finalVatDeductible = 0;
    let finalReimbursable = 0;
    let distanceKm: number | null = null;

    if (type === "ik") {
      const km = parseFloat(rawKm.replace(",", ".")) || 0;
      distanceKm = km;
      const rate = collab.mileageRate || 0.603;
      const computedTotal = Math.round(km * rate * 100) / 100;
      finalAmountTtc = computedTotal;
      finalAmountHt = computedTotal;
      finalVatRate = 0;
      finalProrata = 100;
      finalVatDeductible = 0;
      finalReimbursable = computedTotal;
    } else {
      finalAmountTtc = parseFloat(rawTtc.replace(",", ".")) || 0;
      finalVatRate = parseFloat(rawVat.replace(",", ".")) || 0;
      finalProrata = parseFloat(rawProrata.replace(",", ".")) || 100;

      finalAmountHt = Math.round((finalAmountTtc / (1 + finalVatRate / 100)) * 100) / 100;
      const vatTotal = Math.max(0, Math.round((finalAmountTtc - finalAmountHt) * 100) / 100);
      finalVatDeductible = Math.round(vatTotal * (finalProrata / 100) * 100) / 100;
      finalReimbursable = Math.round(finalAmountTtc * (finalProrata / 100) * 100) / 100;
    }

    db.insert(expenseItems)
      .values({
        id,
        collaboratorId: collab.id,
        type,
        date: formattedDate,
        label: desc,
        amountTtc: finalAmountTtc,
        amountHt: finalAmountHt,
        vatRate: finalVatRate,
        prorataRate: finalProrata,
        vatDeductible: finalVatDeductible,
        reimbursableAmount: finalReimbursable,
        distanceKm,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    importedCount++;
  }

  revalidatePath("/");
  const updatedDashboard = await getDashboardData();
  return {
    success: true,
    importedCount,
    errors: errors.length > 0 ? errors : undefined,
    updatedDashboard,
  };
}
