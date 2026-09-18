import type {
  AppSettings,
  CustomerInvoice,
  ExpenseItem,
  ExpenseReimbursement,
  FixedAsset,
  FixedAssetDisposal,
  FixedAssetSource,
  SupplierInvoice,
  Transaction,
} from "@/db/schema";
import { format } from "date-fns";
import {
  calculateAccountingActivity,
  getCustomerVatRecognitionDate,
  getProfessionalExpenseHt,
  getStandaloneVatTransactions,
  isAccountingDocument,
  toCents,
} from "./accounting";
import { getFiscalYearBounds } from "./fiscal-year";
import { isOutstanding } from "./flows";
import type {
  AccountingActivityItem,
  ExpandedFlow,
  FiscalYearInfo,
  VatCalculationResult,
  VatFiscalSummary,
  VatItem,
} from "./types";

interface VatCalculationInput {
  now: Date;
  todayStr: string;
  settings: AppSettings;
  transactions: Transaction[];
  customerInvoices: CustomerInvoice[];
  supplierInvoices: SupplierInvoice[];
  expenseItems: ExpenseItem[];
  reimbursements: ExpenseReimbursement[];
  fixedAssets?: FixedAsset[];
  fixedAssetDisposals?: FixedAssetDisposal[];
  fixedAssetSources?: FixedAssetSource[];
  collaboratorNames: Map<string, string>;
  manualFlows: ExpandedFlow[];
  offsetYears?: number;
  openingVatCredit?: number;
}

const REGIME_LABELS: Record<string, string> = {
  normal_monthly: "Régime Réel Normal (Mensuel)",
  normal_quarterly: "Régime Réel Normal (Trimestriel)",
  simplified: "Régime Réel Simplifié (RSI)",
};

export function computeVatForFiscalYear({
  now,
  todayStr,
  settings,
  transactions,
  customerInvoices,
  supplierInvoices,
  expenseItems,
  reimbursements,
  fixedAssets = [],
  fixedAssetDisposals = [],
  fixedAssetSources = [],
  collaboratorNames,
  manualFlows,
  offsetYears = 0,
  openingVatCredit = 0,
}: VatCalculationInput): VatCalculationResult {
  const bounds = getFiscalYearBounds(
    now,
    settings.fiscalYearEndDay,
    settings.fiscalYearEndMonth,
    offsetYears,
  );
  const paymentMethod = settings.vatPaymentMethod as FiscalYearInfo["paymentMethod"];
  const fiscalYear: FiscalYearInfo = {
    endDay: settings.fiscalYearEndDay,
    endMonth: settings.fiscalYearEndMonth,
    startDateStr: bounds.startDateStr,
    endDateStr: bounds.endDateStr,
    label: `Exercice fiscal du ${format(bounds.startDate, "dd/MM/yyyy")} au ${format(bounds.endDate, "dd/MM/yyyy")}`,
    regime: settings.vatRegime as FiscalYearInfo["regime"],
    regimeLabel: REGIME_LABELS[settings.vatRegime] || "Régime Réel Normal",
    paymentMethod,
  };
  const period = { startDate: bounds.startDateStr, endDate: bounds.endDateStr };
  const isInFiscalYear = (date: string) => date >= period.startDate && date <= period.endDate;
  const isFutureInFiscalYear = (date: string) => date > todayStr && isInFiscalYear(date);
  const items: VatItem[] = [];
  let collectedRealCents = 0;
  let deductibleRealCents = 0;

  for (const invoice of customerInvoices) {
    const itemDate = getCustomerVatRecognitionDate(invoice, paymentMethod);
    if (!itemDate || !isInFiscalYear(itemDate) || itemDate > todayStr) continue;

    collectedRealCents += toCents(invoice.totalVatAmount);
    addVatItemIfPositive(items, invoice.totalVatAmount, {
      id: invoice.id,
      source: paymentMethod === "debits" ? "Facture Client (Comptabilisée)" : "Facture Client (Encaissée)",
      label: `${invoice.clientName} (${invoice.invoiceNumber})`,
      date: itemDate,
      type: "collectee",
      amountHt: invoice.totalAmountHt,
    });
  }

  // Supplier VAT is sourced from the document on its effective date. Bank VAT
  // is retained only where no supplier document can be identified.
  for (const invoice of supplierInvoices) {
    const itemDate = invoice.issueDate.slice(0, 10);
    if (!isAccountingDocument(invoice.status) || !isInFiscalYear(itemDate) || itemDate > todayStr) continue;

    deductibleRealCents += toCents(invoice.totalVatAmount);
    addVatItemIfPositive(items, invoice.totalVatAmount, {
      id: invoice.id,
      source: "Facture Fournisseur (Comptabilisée)",
      label: `${invoice.supplierName} (${invoice.invoiceNumber || "N/A"})`,
      date: itemDate,
      type: "deductible",
      amountHt: invoice.totalAmountHt,
    });
  }

  for (const transaction of getStandaloneVatTransactions(
    transactions,
    supplierInvoices,
    reimbursements,
    expenseItems,
  )) {
    const transactionDate = transaction.settledAt.slice(0, 10);
    if (!isInFiscalYear(transactionDate) || transactionDate > todayStr) continue;

    const vatAmount = transaction.vatAmount ?? 0;
    deductibleRealCents += toCents(vatAmount);
    items.push({
      id: transaction.id,
      source: "Transaction sans pièce identifiée",
      label: transaction.label,
      date: transactionDate,
      type: "deductible",
      amountHt: Math.max(0, Math.abs(transaction.amount) - vatAmount),
      vatAmount,
    });
  }

  for (const expense of expenseItems) {
    const expenseDate = expense.date.slice(0, 10);
    if (
      expense.accountingStatus === "canceled"
      || expense.type !== "ndf"
      || expense.vatDeductible <= 0
      || !isInFiscalYear(expenseDate)
      || expenseDate > todayStr
    ) continue;

    deductibleRealCents += toCents(expense.vatDeductible);
    items.push({
      id: expense.id,
      source: "Note de Frais",
      label: `${collaboratorNames.get(expense.collaboratorId) || "Collaborateur"} - ${expense.label}`,
      date: expenseDate,
      type: "deductible",
      amountHt: getProfessionalExpenseHt(expense),
      vatRate: expense.vatRate,
      vatAmount: expense.vatDeductible,
    });
  }

  let futureToCollectCents = 0;
  // On collection basis, an unpaid invoice is forecast VAT at expected receipt.
  // On debit basis it is already actual VAT at issue date and must not reappear.
  if (paymentMethod === "encaissements") {
    for (const invoice of customerInvoices) {
      const dueDate = (invoice.dueDate || invoice.issueDate).slice(0, 10);
      if (!isOutstanding(invoice.status) || !isFutureInFiscalYear(dueDate)) continue;
      futureToCollectCents += toCents(invoice.totalVatAmount);
      addVatItemIfPositive(items, invoice.totalVatAmount, {
        id: `forecast-customer-${invoice.id}`,
        source: "Facture Client (Prévision)",
        label: `${invoice.clientName} (${invoice.invoiceNumber})`,
        date: dueDate,
        type: "collectee",
        amountHt: invoice.totalAmountHt,
      });
    }
  }

  const fiscalFutureFlows = manualFlows.filter((flow) => isFutureInFiscalYear(flow.date));
  const manualInflowsVatCents = sumFlowCents(fiscalFutureFlows, "inflow", "vatAmount");
  const manualOutflowsVatCents = sumFlowCents(fiscalFutureFlows, "outflow", "vatAmount");
  for (const flow of fiscalFutureFlows) {
    addVatItemIfPositive(items, flow.vatAmount, {
      id: `future-${flow.id}-${flow.date}`,
      source: "Flux Futur",
      label: flow.label,
      date: flow.date,
      type: flow.type === "inflow" ? "collectee" : "deductible",
      amountHt: flow.amountHt,
    });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));

  const collectedReal = fromCents(collectedRealCents);
  const deductibleReal = fromCents(deductibleRealCents);
  const collectedFuture = fromCents(futureToCollectCents + manualInflowsVatCents);
  const deductibleFuture = fromCents(manualOutflowsVatCents);
  const normalizedOpeningVatCredit = fromCents(Math.max(0, toCents(openingVatCredit)));
  // The payable/provision amount intentionally excludes every forecast source.
  const rawBalance = roundCurrency(collectedReal - deductibleReal - normalizedOpeningVatCredit);
  const threshold = settings.vatRegime === "simplified" ? 150 : 760;
  const balanceStatus = getBalanceStatus(rawBalance, threshold);
  const accountingActivity = calculateAccountingActivity(
    period,
    customerInvoices,
    supplierInvoices,
    expenseItems,
    fixedAssets,
    fixedAssetDisposals,
    fixedAssetSources,
  );
  const revenueFuture = sumFlowCents(fiscalFutureFlows, "inflow", "amountHt") / 100;
  const expensesFuture = sumFlowCents(fiscalFutureFlows, "outflow", "amountHt") / 100;
  const forecastActivityItems: AccountingActivityItem[] = fiscalFutureFlows.map((flow) => ({
    id: `forecast-${flow.id}-${flow.date}`,
    type: flow.type === "inflow" ? "revenue" : "expense",
    source: "Flux futur",
    label: flow.label,
    date: flow.date,
    amountHt: roundCurrency(flow.amountHt),
    isForecast: true,
  }));
  const accountingActivityItems = [...accountingActivity.items, ...forecastActivityItems]
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalRevenue = roundCurrency(accountingActivity.revenueHt + revenueFuture);
  const totalExpenses = roundCurrency(accountingActivity.expensesHt + expensesFuture);
  const summary: VatFiscalSummary = {
    fiscalYear,
    collectedReal,
    collectedFuture,
    totalCollected: roundCurrency(collectedReal + collectedFuture),
    deductibleReal,
    deductibleFuture,
    totalDeductible: roundCurrency(deductibleReal + deductibleFuture),
    openingVatCredit: normalizedOpeningVatCredit,
    rawBalance,
    ...balanceStatus,
    threshold,
    revenueReal: accountingActivity.revenueHt,
    revenueFuture,
    totalRevenue,
    expensesReal: accountingActivity.expensesHt,
    expensesFuture,
    totalExpenses,
    activityBalance: roundCurrency(totalRevenue - totalExpenses),
  };

  return {
    summary,
    items,
    accountingActivityItems,
    details: {
      collectedReal,
      deductibleReal,
      futureToCollect: fromCents(futureToCollectCents),
      futureToDeduct: 0,
      futureForecastFlowsVat: fromCents(manualInflowsVatCents - manualOutflowsVatCents),
    },
  };
}

function addVatItemIfPositive(items: VatItem[], vatAmount: number, item: Omit<VatItem, "vatAmount">): void {
  if (vatAmount > 0) items.push({ ...item, vatAmount: roundCurrency(vatAmount) });
}

function sumFlowCents(
  flows: ExpandedFlow[],
  type: ExpandedFlow["type"],
  field: "vatAmount" | "amountHt",
): number {
  return flows.filter((flow) => flow.type === type).reduce((total, flow) => total + toCents(flow[field]), 0);
}

export function getBalanceStatus(rawBalance: number, threshold: number): Pick<
  VatFiscalSummary,
  "status" | "statusLabel" | "vatToProvision" | "refundableVat" | "carriedOverVat"
> {
  if (rawBalance > 0) {
    return {
      status: "due",
      statusLabel: "TVA réelle nette à décaisser / provisionner",
      vatToProvision: rawBalance,
      refundableVat: 0,
      carriedOverVat: 0,
    };
  }

  if (rawBalance < 0) {
    const credit = roundCurrency(Math.abs(rawBalance));
    return {
      status: credit >= threshold ? "credit_eligible" : "credit_carried_over",
      statusLabel: credit >= threshold
        ? `Crédit éligible à une demande de remboursement (non demandée automatiquement, seuil ${threshold} €)`
        : `Crédit à reporter (seuil indicatif de demande ${threshold} €)`,
      vatToProvision: 0,
      refundableVat: credit >= threshold ? credit : 0,
      // No explicit reimbursement workflow exists, so the full credit is
      // carried into the following fiscal estimate even when requestable.
      carriedOverVat: credit,
    };
  }

  return {
    status: "due",
    statusLabel: "TVA réelle équilibrée (0,00 €)",
    vatToProvision: 0,
    refundableVat: 0,
    carriedOverVat: 0,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function fromCents(value: number): number {
  return value / 100;
}
