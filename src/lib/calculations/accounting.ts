import type {
  CustomerInvoice,
  ExpenseItem,
  ExpenseReimbursement,
  FixedAsset,
  FixedAssetDisposal,
  FixedAssetSource,
  SupplierInvoice,
  Transaction,
} from "@/db/schema";
import { summarizeDepreciationForPeriod } from "./depreciation";
import type { AccountingActivityItem } from "./types";

const EXCLUDED_DOCUMENT_STATUSES = new Set(["canceled", "cancelled", "draft", "declined", "rejected"]);

export interface AccountingPeriod {
  startDate: string;
  endDate: string;
}

export interface AccountingActivity {
  revenueHt: number;
  expensesHt: number;
  activityBalance: number;
  items: AccountingActivityItem[];
}

export function isAccountingDocument(status: string): boolean {
  return !EXCLUDED_DOCUMENT_STATUSES.has(status.trim().toLowerCase());
}

export function isDateInPeriod(date: string, period: AccountingPeriod): boolean {
  const day = date.slice(0, 10);
  return day >= period.startDate && day <= period.endDate;
}

/**
 * The stored HT amount is the professional HT portion for current records.
 * Legacy rows are recovered from the professional TTC liability less deductible
 * VAT, which also prevents their private portion from becoming a company cost.
 */
export function getProfessionalExpenseHt(expense: ExpenseItem): number {
  const derivedProfessionalHt = toCents(expense.reimbursableAmount) - toCents(expense.vatDeductible);
  const storedHt = toCents(expense.amountHt);
  const fullReceiptHt = toCents(expense.amountTtc) - toCents(expense.amountTtc - expense.amountHt);
  const looksLikeLegacyFullAmount = expense.prorataRate < 100 && storedHt >= fullReceiptHt;

  return fromCents(looksLikeLegacyFullAmount ? derivedProfessionalHt : storedHt);
}

export function calculateAccountingActivity(
  period: AccountingPeriod,
  customerInvoices: CustomerInvoice[],
  supplierInvoices: SupplierInvoice[],
  expenseItems: ExpenseItem[],
  fixedAssets: FixedAsset[] = [],
  fixedAssetDisposals: FixedAssetDisposal[] = [],
  fixedAssetSources: FixedAssetSource[] = [],
): AccountingActivity {
  const recognizedCustomerInvoices = customerInvoices
    .filter((invoice) => isAccountingDocument(invoice.status) && isDateInPeriod(invoice.issueDate, period));
  const revenueCents = recognizedCustomerInvoices
    .reduce((total, invoice) => total + toCents(invoice.totalAmountHt), 0);
  const capitalizedSupplierInvoiceIds = new Set([
    ...fixedAssets.map((asset) => asset.supplierInvoiceId),
    ...fixedAssetSources.map((source) => source.supplierInvoiceId),
  ].filter((id): id is string => Boolean(id)));
  const capitalizedExpenseIds = new Set([
    ...fixedAssets.map((asset) => asset.sourceExpenseItemId),
    ...fixedAssetSources.map((source) => source.expenseItemId),
  ].filter((id): id is string => Boolean(id)));
  const recognizedSupplierInvoices = supplierInvoices
    .filter((invoice) => isAccountingDocument(invoice.status) && isDateInPeriod(invoice.issueDate, period) && !capitalizedSupplierInvoiceIds.has(invoice.id));
  const supplierExpenseCents = recognizedSupplierInvoices
    .reduce((total, invoice) => total + toCents(invoice.totalAmountHt), 0);
  const recognizedExpenseItems = expenseItems
    .filter((expense) => expense.accountingStatus !== "canceled" && isDateInPeriod(expense.date, period) && !capitalizedExpenseIds.has(expense.id));
  const expenseReportCents = recognizedExpenseItems
    .reduce((total, expense) => total + toCents(getProfessionalExpenseHt(expense)), 0);
  const disposalByAsset = new Map(fixedAssetDisposals.map((disposal) => [disposal.fixedAssetId, disposal]));
  const depreciationItems = fixedAssets
    .filter((asset) => asset.status !== "draft")
    .map((asset) => ({
      asset,
      amountCents: summarizeDepreciationForPeriod(asset, period, disposalByAsset.get(asset.id)).depreciationCents,
    }))
    .filter(({ amountCents }) => amountCents > 0);
  const depreciationCents = depreciationItems.reduce((total, item) => total + item.amountCents, 0);
  const expensesCents = supplierExpenseCents + expenseReportCents + depreciationCents;
  const items: AccountingActivityItem[] = [
    ...recognizedCustomerInvoices.map((invoice) => ({
      id: `customer-${invoice.id}`,
      type: "revenue" as const,
      source: "Facture client" as const,
      label: `${invoice.clientName} (${invoice.invoiceNumber})`,
      date: invoice.issueDate.slice(0, 10),
      amountHt: fromCents(toCents(invoice.totalAmountHt)),
      isForecast: false,
    })),
    ...recognizedSupplierInvoices.map((invoice) => ({
      id: `supplier-${invoice.id}`,
      type: "expense" as const,
      source: "Facture fournisseur" as const,
      label: `${invoice.supplierName} (${invoice.invoiceNumber || "N/A"})`,
      date: invoice.issueDate.slice(0, 10),
      amountHt: fromCents(toCents(invoice.totalAmountHt)),
      isForecast: false,
    })),
    ...recognizedExpenseItems.map((expense) => ({
      id: `expense-${expense.id}`,
      type: "expense" as const,
      source: expense.type === "ik" ? "Indemnité kilométrique" as const : "Note de frais" as const,
      label: expense.label,
      date: expense.date.slice(0, 10),
      amountHt: fromCents(toCents(getProfessionalExpenseHt(expense))),
      isForecast: false,
    })),
    ...depreciationItems.map(({ asset, amountCents }) => ({
      id: `depreciation-${asset.id}-${period.startDate}`,
      type: "expense" as const,
      source: "Dotation aux amortissements" as const,
      label: `${asset.label} (${asset.assetNumber})`,
      date: period.endDate,
      amountHt: fromCents(amountCents),
      isForecast: false,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return {
    revenueHt: fromCents(revenueCents),
    expensesHt: fromCents(expensesCents),
    activityBalance: fromCents(revenueCents - expensesCents),
    items,
  };
}

export function getCustomerVatRecognitionDate(
  invoice: CustomerInvoice,
  paymentMethod: "debits" | "encaissements",
): string | null {
  if (!isAccountingDocument(invoice.status)) return null;
  if (paymentMethod === "debits") return invoice.issueDate.slice(0, 10);

  // Collection basis requires evidence of collection. A "paid" status without
  // paidAt is intentionally not guessed from issue/due dates.
  if (invoice.status.toLowerCase() !== "paid" || !invoice.paidAt) return null;
  return invoice.paidAt.slice(0, 10);
}

export function getLinkedSettlementTransactionIds(
  reimbursements: ExpenseReimbursement[],
  expenseItems: ExpenseItem[],
): Set<string> {
  return new Set([
    ...reimbursements.map((item) => item.transactionId),
    ...expenseItems.map((item) => item.sourceTransactionId),
  ].filter((id): id is string => Boolean(id)));
}

/**
 * Qonto payloads may expose an explicit transaction identifier on a supplier
 * invoice. When absent, matching remains deliberately strict: same TTC cents,
 * same payment day, and a meaningful supplier token in the bank label.
 */
export function transactionMatchesSupplierInvoice(
  transaction: Transaction,
  invoice: SupplierInvoice,
): boolean {
  const rawTransactionIds = extractTransactionIds(invoice.rawJson);
  if (rawTransactionIds.has(transaction.id)) return true;
  if (!invoice.paidAt || invoice.status.toLowerCase() !== "paid") return false;
  if (transaction.settledAt.slice(0, 10) !== invoice.paidAt.slice(0, 10)) return false;
  if (Math.abs(transaction.amountCents) !== Math.abs(toCents(invoice.totalAmountTtc))) return false;

  const supplierTokens = normalizeWords(invoice.supplierName);
  const transactionTokens = normalizeWords(transaction.label);
  return supplierTokens.some((token) => token.length >= 4 && transactionTokens.includes(token));
}

export function getStandaloneVatTransactions(
  transactions: Transaction[],
  supplierInvoices: SupplierInvoice[],
  reimbursements: ExpenseReimbursement[],
  expenseItems: ExpenseItem[],
): Transaction[] {
  const settlementIds = getLinkedSettlementTransactionIds(reimbursements, expenseItems);

  return transactions.filter((transaction) => {
    if (transaction.side !== "debit" || (transaction.vatAmount ?? 0) <= 0) return false;
    if (settlementIds.has(transaction.id)) return false;
    return !supplierInvoices.some((invoice) => transactionMatchesSupplierInvoice(transaction, invoice));
  });
}

function extractTransactionIds(rawJson: string | null): Set<string> {
  if (!rawJson) return new Set();
  try {
    const raw = JSON.parse(rawJson) as Record<string, unknown>;
    const candidates = [
      raw.transaction_id,
      raw.transactionId,
      raw.payment_transaction_id,
      ...(Array.isArray(raw.transaction_ids) ? raw.transaction_ids : []),
      ...(Array.isArray(raw.transactions)
        ? raw.transactions.flatMap((value) => {
            if (typeof value === "string") return [value];
            if (value && typeof value === "object" && "id" in value) return [(value as { id: unknown }).id];
            return [];
          })
        : []),
    ];
    return new Set(candidates.filter((value): value is string => typeof value === "string" && value.length > 0));
  } catch {
    return new Set();
  }
}

function normalizeWords(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(value: number): number {
  return value / 100;
}
