"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  appSettings,
  expenseItems,
  fixedAssetDisposals,
  fixedAssets,
  fixedAssetSources,
  supplierInvoices,
  transactions,
  type FixedAsset,
} from "@/db/schema";
import { getDashboardData } from "@/lib/calculations";
import {
  buildMonthlyDepreciationSchedule,
  calculateDepreciationAmounts,
  getTheoreticalAccumulatedCents,
} from "@/lib/calculations/depreciation";

export interface FixedAssetInput {
  assetNumber?: string;
  label: string;
  description?: string;
  category: string;
  supplierName: string;
  purchaseDate: string;
  serviceDate: string;
  invoiceNumber?: string;
  supplierInvoiceId?: string | null;
  documentUrl?: string;
  sourceType: "none" | "transaction" | "expense_item" | "supplier_invoice";
  sourceTransactionId?: string | null;
  sourceExpenseItemId?: string | null;
  sourceIds?: string[];
  amountHtCents: number;
  vatAmountCents: number;
  amountTtcCents: number;
  vatRate: number;
  vatDeductibleRate: number;
  incidentalCostsCents?: number;
  residualValueCents?: number;
  depreciationDurationMonths: number;
  assetAccount: string;
  depreciationAccount: string;
  expenseAccount: string;
  isOpeningBalance?: boolean;
  openingDate?: string | null;
  openingAccumulatedDepreciationCents?: number;
}

export interface FixedAssetDisposalInput {
  type: "sale" | "scrap";
  disposalDate: string;
  saleAmountHtCents?: number;
  saleVatAmountCents?: number;
  saleAmountTtcCents?: number;
  customerInvoiceId?: string | null;
  transactionId?: string | null;
  notes?: string;
}

export async function getFixedAssetDataAction() {
  const assets = db.select().from(fixedAssets).all();
  const disposals = db.select().from(fixedAssetDisposals).all();
  const sources = db.select().from(fixedAssetSources).all();
  const settings = db.select().from(appSettings).all()[0];

  return {
    assets: assets.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)),
    disposals,
    sources,
    transactions: db.select().from(transactions).all()
      .filter((item) => item.side === "debit" || item.amount < 0)
      .sort((a, b) => b.settledAt.localeCompare(a.settledAt)),
    expenses: db.select().from(expenseItems).all()
      .filter((item) => item.accountingStatus !== "canceled")
      .sort((a, b) => b.date.localeCompare(a.date)),
    supplierInvoices: db.select().from(supplierInvoices).all()
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    thresholdCents: settings?.fixedAssetThresholdCents ?? 50000,
    fiscalYearEndDay: settings?.fiscalYearEndDay ?? 31,
    fiscalYearEndMonth: settings?.fiscalYearEndMonth ?? 12,
  };
}

export async function createFixedAssetAction(input: FixedAssetInput) {
  const id = `asset-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const values = validateAndBuildAsset(input, id, now);
  db.transaction((tx) => {
    tx.insert(fixedAssets).values(values).run();
    insertAssetSources(tx, id, input, now);
  });
  return refresh();
}

export async function updateFixedAssetAction(id: string, input: FixedAssetInput) {
  requireAsset(id);
  const now = new Date().toISOString();
  const values = validateAndBuildAsset(input, id, now, id);
  const { id: _id, createdAt: _createdAt, ...updates } = values;
  void _id;
  void _createdAt;
  db.transaction((tx) => {
    tx.update(fixedAssets).set(updates).where(eq(fixedAssets.id, id)).run();
    tx.delete(fixedAssetSources).where(eq(fixedAssetSources.fixedAssetId, id)).run();
    insertAssetSources(tx, id, input, now);
  });
  return refresh();
}

export async function deleteFixedAssetAction(id: string) {
  requireAsset(id);
  db.delete(fixedAssets).where(eq(fixedAssets.id, id)).run();
  return refresh();
}

export async function disposeFixedAssetAction(id: string, input: FixedAssetDisposalInput) {
  const asset = requireAsset(id);
  if (!isIsoDate(input.disposalDate) || input.disposalDate < asset.serviceDate) {
    throw new Error("La date de sortie doit être postérieure ou égale à la mise en service.");
  }
  const amounts = [input.saleAmountHtCents ?? 0, input.saleVatAmountCents ?? 0, input.saleAmountTtcCents ?? 0];
  if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) throw new Error("Les montants de cession sont invalides.");
  const now = new Date().toISOString();
  db.insert(fixedAssetDisposals).values({
    id: `disposal-${crypto.randomUUID()}`,
    fixedAssetId: id,
    type: input.type,
    disposalDate: input.disposalDate,
    saleAmountHtCents: amounts[0],
    saleVatAmountCents: amounts[1],
    saleAmountTtcCents: amounts[2],
    customerInvoiceId: input.customerInvoiceId || null,
    transactionId: input.transactionId || null,
    notes: clean(input.notes),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: fixedAssetDisposals.fixedAssetId,
    set: {
      type: input.type,
      disposalDate: input.disposalDate,
      saleAmountHtCents: amounts[0],
      saleVatAmountCents: amounts[1],
      saleAmountTtcCents: amounts[2],
      customerInvoiceId: input.customerInvoiceId || null,
      transactionId: input.transactionId || null,
      notes: clean(input.notes),
      updatedAt: now,
    },
  }).run();
  db.update(fixedAssets).set({ status: input.type === "sale" ? "disposed" : "scrapped", updatedAt: now }).where(eq(fixedAssets.id, id)).run();
  return refresh();
}

export async function cancelFixedAssetDisposalAction(id: string) {
  const asset = requireAsset(id);
  db.delete(fixedAssetDisposals).where(eq(fixedAssetDisposals.fixedAssetId, id)).run();
  const fullyDepreciated = buildMonthlyDepreciationSchedule(asset).at(-1)?.netBookValueCents === asset.residualValueCents;
  db.update(fixedAssets).set({ status: fullyDepreciated ? "fully_depreciated" : "in_service", updatedAt: new Date().toISOString() }).where(eq(fixedAssets.id, id)).run();
  return refresh();
}

function validateAndBuildAsset(input: FixedAssetInput, id: string, now: string, excludeId?: string): typeof fixedAssets.$inferInsert {
  if (!input.label.trim() || !input.category.trim() || !input.supplierName.trim()) throw new Error("Libellé, catégorie et fournisseur sont obligatoires.");
  if (!isIsoDate(input.purchaseDate) || !isIsoDate(input.serviceDate) || input.serviceDate < input.purchaseDate) {
    throw new Error("Les dates d'achat et de mise en service sont invalides.");
  }
  if (!Number.isInteger(input.depreciationDurationMonths) || input.depreciationDurationMonths < 1) throw new Error("La durée doit être d'au moins un mois.");
  if (!Number.isInteger(input.amountTtcCents) || input.amountTtcCents < 0) throw new Error("Le montant TTC est invalide.");
  if (!Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) throw new Error("Le taux de TVA est invalide.");
  validateSource(input, excludeId);

  const amounts = calculateDepreciationAmounts(input);
  const openingCents = input.isOpeningBalance ? input.openingAccumulatedDepreciationCents ?? 0 : 0;
  if (!Number.isInteger(openingCents) || openingCents < 0 || openingCents > amounts.depreciableBaseCents) throw new Error("Le cumul d'ouverture est invalide.");
  if (input.isOpeningBalance && (!input.openingDate || !isIsoDate(input.openingDate) || input.openingDate < input.serviceDate)) {
    throw new Error("La date de reprise est obligatoire et ne peut pas précéder la mise en service.");
  }

  const assetNumber = clean(input.assetNumber) || nextAssetNumber();
  const duplicateNumber = db.select({ id: fixedAssets.id }).from(fixedAssets).where(eq(fixedAssets.assetNumber, assetNumber)).all()[0];
  if (duplicateNumber && duplicateNumber.id !== excludeId) throw new Error("Ce numéro d'immobilisation existe déjà.");

  return {
    id,
    assetNumber,
    label: input.label.trim(),
    description: clean(input.description),
    category: input.category.trim(),
    supplierName: input.supplierName.trim(),
    purchaseDate: input.purchaseDate,
    serviceDate: input.serviceDate,
    invoiceNumber: clean(input.invoiceNumber),
    supplierInvoiceId: input.supplierInvoiceId || null,
    documentUrl: clean(input.documentUrl),
    // Supplier invoices use the dedicated supplierInvoiceId relation. The database
    // source discriminator only distinguishes direct bank and expense-report sources.
    sourceType: input.sourceType === "supplier_invoice" ? "none" : input.sourceType,
    sourceTransactionId: input.sourceType === "transaction" ? input.sourceTransactionId : null,
    sourceExpenseItemId: input.sourceType === "expense_item" ? input.sourceExpenseItemId : null,
    amountHtCents: input.amountHtCents,
    vatAmountCents: input.vatAmountCents,
    amountTtcCents: input.amountTtcCents,
    vatRate: input.vatRate,
    vatDeductibleRate: input.vatDeductibleRate,
    incidentalCostsCents: input.incidentalCostsCents ?? 0,
    acquisitionCostCents: amounts.acquisitionCostCents,
    residualValueCents: input.residualValueCents ?? 0,
    depreciableBaseCents: amounts.depreciableBaseCents,
    depreciationMethod: "straight_line",
    depreciationDurationMonths: input.depreciationDurationMonths,
    assetAccount: input.assetAccount.trim(),
    depreciationAccount: input.depreciationAccount.trim(),
    expenseAccount: input.expenseAccount.trim(),
    isOpeningBalance: Boolean(input.isOpeningBalance),
    openingDate: input.isOpeningBalance ? input.openingDate : null,
    openingAccumulatedDepreciationCents: openingCents,
    status: amounts.depreciableBaseCents === openingCents ? "fully_depreciated" : "in_service",
    createdAt: now,
    updatedAt: now,
  };
}

function validateSource(input: FixedAssetInput, excludeId?: string) {
  const sourceIds = [...new Set((input.sourceIds ?? []).filter(Boolean))];
  const transactionId = input.sourceType === "transaction" ? sourceIds[0] ?? input.sourceTransactionId ?? null : null;
  const expenseId = input.sourceType === "expense_item" ? sourceIds[0] ?? input.sourceExpenseItemId ?? null : null;
  if (input.sourceType !== "none" && sourceIds.length === 0 && !transactionId && !expenseId && !input.supplierInvoiceId) throw new Error("Sélectionnez au moins une source.");
  if (input.sourceType === "transaction" && (!transactionId || expenseId)) throw new Error("Sélectionnez uniquement des transactions Qonto.");
  if (input.sourceType === "expense_item" && (!expenseId || transactionId)) throw new Error("Sélectionnez uniquement des notes de frais.");
  if (input.sourceType === "supplier_invoice" && (!input.supplierInvoiceId || transactionId || expenseId)) throw new Error("Sélectionnez uniquement une facture fournisseur comme source.");
  if (input.sourceType === "none" && (transactionId || expenseId)) throw new Error("Une source ne peut pas être renseignée pour le type « aucune ».");
  if (input.sourceType === "transaction") for (const id of sourceIds.length ? sourceIds : [transactionId!]) {
    if (!db.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, id)).all()[0]) throw new Error("Transaction introuvable.");
    const linked = db.select().from(fixedAssetSources).where(eq(fixedAssetSources.transactionId, id)).all()[0];
    if (linked && linked.fixedAssetId !== excludeId) throw new Error("Une transaction sélectionnée est déjà rattachée à une immobilisation.");
  }
  if (input.sourceType === "expense_item") for (const id of sourceIds.length ? sourceIds : [expenseId!]) {
    const expense = db.select().from(expenseItems).where(eq(expenseItems.id, id)).all()[0];
    if (!expense) throw new Error("Note de frais introuvable.");
    const linked = db.select().from(fixedAssetSources).where(eq(fixedAssetSources.expenseItemId, id)).all()[0];
    if (linked && linked.fixedAssetId !== excludeId) throw new Error("Une note de frais sélectionnée est déjà rattachée à une immobilisation.");
  }
  if (input.supplierInvoiceId) {
    const invoice = db.select().from(supplierInvoices).where(eq(supplierInvoices.id, input.supplierInvoiceId)).all()[0];
    if (!invoice) throw new Error("Facture fournisseur introuvable.");
  }
  if (input.sourceType === "supplier_invoice") for (const id of sourceIds.length ? sourceIds : [input.supplierInvoiceId!]) {
    const invoice = db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).all()[0];
    if (!invoice) throw new Error("Facture fournisseur introuvable.");
    const linked = db.select().from(fixedAssetSources).where(eq(fixedAssetSources.supplierInvoiceId, id)).all()[0];
    if (linked && linked.fixedAssetId !== excludeId) throw new Error("Une facture sélectionnée est déjà rattachée à une immobilisation.");
  }
  const sourceCondition = transactionId
    ? eq(fixedAssets.sourceTransactionId, transactionId)
    : expenseId ? eq(fixedAssets.sourceExpenseItemId, expenseId) : null;
  if (sourceCondition) {
    const condition = excludeId ? and(sourceCondition, ne(fixedAssets.id, excludeId)) : sourceCondition;
    if (db.select({ id: fixedAssets.id }).from(fixedAssets).where(condition).all()[0]) throw new Error("Cette source est déjà rattachée à une immobilisation.");
  }
}

function insertAssetSources(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], fixedAssetId: string, input: FixedAssetInput, now: string) {
  const ids = [...new Set((input.sourceIds ?? []).filter(Boolean))];
  if (ids.length === 0) {
    if (input.sourceType === "transaction" && input.sourceTransactionId) ids.push(input.sourceTransactionId);
    if (input.sourceType === "expense_item" && input.sourceExpenseItemId) ids.push(input.sourceExpenseItemId);
    if (input.sourceType === "supplier_invoice" && input.supplierInvoiceId) ids.push(input.supplierInvoiceId);
  }
  if (input.sourceType === "none") return;
  tx.insert(fixedAssetSources).values(ids.map((sourceId) => ({
    id: `asset-source-${crypto.randomUUID()}`,
    fixedAssetId,
    sourceType: input.sourceType,
    transactionId: input.sourceType === "transaction" ? sourceId : null,
    expenseItemId: input.sourceType === "expense_item" ? sourceId : null,
    supplierInvoiceId: input.sourceType === "supplier_invoice" ? sourceId : null,
    createdAt: now,
  }))).run();
}

function requireAsset(id: string): FixedAsset {
  const asset = db.select().from(fixedAssets).where(eq(fixedAssets.id, id)).all()[0];
  if (!asset) throw new Error("Immobilisation introuvable.");
  return asset;
}

function nextAssetNumber(): string {
  const year = new Date().getFullYear();
  const count = db.select({ id: fixedAssets.id }).from(fixedAssets).all().length + 1;
  return `IMMO-${year}-${String(count).padStart(4, "0")}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function clean(value?: string): string | null {
  const result = value?.trim();
  return result || null;
}

async function refresh() {
  revalidatePath("/");
  return { success: true, updatedDashboard: await getDashboardData() };
}

export async function getOpeningDepreciationPreviewAction(input: FixedAssetInput) {
  const now = new Date().toISOString();
  const asset = validateAndBuildAsset({ ...input, isOpeningBalance: false }, "preview", now);
  return getTheoreticalAccumulatedCents(asset as FixedAsset, input.openingDate || input.serviceDate);
}
