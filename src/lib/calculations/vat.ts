import type {
  AppSettings,
  CustomerInvoice,
  ExpenseItem,
  SupplierInvoice,
  Transaction,
} from "@/db/schema";
import { format } from "date-fns";
import { getFiscalYearBounds } from "./fiscal-year";
import { isOutstanding } from "./flows";
import type {
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
  collaboratorNames: Map<string, string>;
  manualFlows: ExpandedFlow[];
  offsetYears?: number;
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
  collaboratorNames,
  manualFlows,
  offsetYears = 0,
}: VatCalculationInput): VatCalculationResult {
  const bounds = getFiscalYearBounds(
    now,
    settings.fiscalYearEndDay,
    settings.fiscalYearEndMonth,
    offsetYears,
  );
  const fiscalYear: FiscalYearInfo = {
    endDay: settings.fiscalYearEndDay,
    endMonth: settings.fiscalYearEndMonth,
    startDateStr: bounds.startDateStr,
    endDateStr: bounds.endDateStr,
    label: `Exercice fiscal du ${format(bounds.startDate, "dd/MM/yyyy")} au ${format(bounds.endDate, "dd/MM/yyyy")}`,
    regime: settings.vatRegime as FiscalYearInfo["regime"],
    regimeLabel: REGIME_LABELS[settings.vatRegime] || "Régime Réel Normal",
    paymentMethod: settings.vatPaymentMethod as FiscalYearInfo["paymentMethod"],
  };
  const isInFiscalYear = (date: string) => date >= bounds.startDateStr && date <= bounds.endDateStr;
  const isFutureInFiscalYear = (date: string) => date >= todayStr && isInFiscalYear(date);
  const items: VatItem[] = [];

  let collectedReal = 0;
  for (const invoice of customerInvoices) {
    if (invoice.status !== "paid") continue;
    const itemDate = (invoice.paidAt || invoice.issueDate).slice(0, 10);
    if (!isInFiscalYear(itemDate)) continue;

    collectedReal += invoice.totalVatAmount;
    addVatItemIfPositive(items, invoice.totalVatAmount, {
      id: invoice.id,
      source: "Facture Client (Encaissée)",
      label: `${invoice.clientName} (${invoice.invoiceNumber})`,
      date: itemDate,
      type: "collectee",
      amountHt: invoice.totalAmountHt,
    });
  }

  let deductibleReal = 0;
  for (const invoice of supplierInvoices) {
    if (invoice.status !== "paid") continue;
    const itemDate = (invoice.paidAt || invoice.issueDate).slice(0, 10);
    if (!isInFiscalYear(itemDate)) continue;

    deductibleReal += invoice.totalVatAmount;
    addVatItemIfPositive(items, invoice.totalVatAmount, {
      id: invoice.id,
      source: "Facture Fournisseur (Payée)",
      label: `${invoice.supplierName} (${invoice.invoiceNumber || "N/A"})`,
      date: itemDate,
      type: "deductible",
      amountHt: invoice.totalAmountHt,
    });
  }

  for (const transaction of transactions) {
    if (transaction.side !== "debit" || !transaction.vatAmount || transaction.vatAmount <= 0) continue;
    const transactionDate = transaction.settledAt.slice(0, 10);
    if (!isInFiscalYear(transactionDate)) continue;

    deductibleReal += transaction.vatAmount;
    items.push({
      id: transaction.id,
      source: "Dépense / Transaction",
      label: transaction.label,
      date: transactionDate,
      type: "deductible",
      amountHt: Math.max(0, Math.abs(transaction.amount) - transaction.vatAmount),
      vatAmount: transaction.vatAmount,
    });
  }

  for (const expense of expenseItems) {
    const expenseDate = expense.date.slice(0, 10);
    if (expense.type !== "ndf" || expense.vatDeductible <= 0 || !isInFiscalYear(expenseDate)) continue;

    deductibleReal += expense.vatDeductible;
    items.push({
      id: expense.id,
      source: "Note de Frais",
      label: `${collaboratorNames.get(expense.collaboratorId) || "Collaborateur"} - ${expense.label}`,
      date: expenseDate,
      type: "deductible",
      amountHt: expense.amountHt,
      vatRate: expense.vatRate,
      vatAmount: expense.vatDeductible,
    });
  }

  let futureToCollect = 0;
  for (const invoice of customerInvoices) {
    const dueDate = (invoice.dueDate || invoice.issueDate).slice(0, 10);
    if (!isOutstanding(invoice.status) || !isFutureInFiscalYear(dueDate)) continue;

    futureToCollect += invoice.totalVatAmount;
    addVatItemIfPositive(items, invoice.totalVatAmount, {
      id: invoice.id,
      source: "Facture Client (À encaisser)",
      label: `${invoice.clientName} (${invoice.invoiceNumber})`,
      date: dueDate,
      type: "collectee",
      amountHt: invoice.totalAmountHt,
    });
  }

  let futureToDeduct = 0;
  for (const invoice of supplierInvoices) {
    const dueDate = (invoice.dueDate || invoice.issueDate).slice(0, 10);
    if (!isOutstanding(invoice.status) || !isFutureInFiscalYear(dueDate)) continue;

    futureToDeduct += invoice.totalVatAmount;
    addVatItemIfPositive(items, invoice.totalVatAmount, {
      id: invoice.id,
      source: "Facture Fournisseur (À décaisser)",
      label: `${invoice.supplierName} (${invoice.invoiceNumber || "N/A"})`,
      date: dueDate,
      type: "deductible",
      amountHt: invoice.totalAmountHt,
    });
  }

  const fiscalFutureFlows = manualFlows.filter((flow) => isFutureInFiscalYear(flow.date));
  let futureForecastFlowsVat = 0;
  for (const flow of fiscalFutureFlows) {
    futureForecastFlowsVat += flow.type === "inflow" ? flow.vatAmount : -flow.vatAmount;
    addVatItemIfPositive(items, flow.vatAmount, {
      id: `future-${flow.label}-${flow.date}`,
      source: "Flux Futur",
      label: flow.label,
      date: flow.date,
      type: flow.type === "inflow" ? "collectee" : "deductible",
      amountHt: flow.amountHt,
    });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));

  const manualInflowsVat = sumFlows(fiscalFutureFlows, "inflow", "vatAmount");
  const manualOutflowsVat = sumFlows(fiscalFutureFlows, "outflow", "vatAmount");
  const totalCollected = collectedReal + futureToCollect + manualInflowsVat;
  const totalDeductible = deductibleReal + futureToDeduct + manualOutflowsVat;
  const rawBalance = roundCurrency(totalCollected - totalDeductible);

  let revenueReal = 0;
  let expensesReal = 0;
  for (const transaction of transactions) {
    if (!isInFiscalYear(transaction.settledAt.slice(0, 10))) continue;
    if (transaction.side === "credit" || transaction.amount > 0) revenueReal += Math.abs(transaction.amount);
    else expensesReal += Math.abs(transaction.amount);
  }

  let revenueFuture = customerInvoices
    .filter((invoice) => isOutstanding(invoice.status) && isFutureInFiscalYear((invoice.dueDate || invoice.issueDate).slice(0, 10)))
    .reduce((total, invoice) => total + invoice.totalAmountTtc, 0);
  let expensesFuture = supplierInvoices
    .filter((invoice) => isOutstanding(invoice.status) && isFutureInFiscalYear((invoice.dueDate || invoice.issueDate).slice(0, 10)))
    .reduce((total, invoice) => total + invoice.totalAmountTtc, 0);
  revenueFuture += sumFlows(fiscalFutureFlows, "inflow", "amountTtc");
  expensesFuture += sumFlows(fiscalFutureFlows, "outflow", "amountTtc");

  const threshold = settings.vatRegime === "simplified" ? 150 : 760;
  const balanceStatus = getBalanceStatus(rawBalance, threshold);
  const totalRevenue = roundCurrency(revenueReal + revenueFuture);
  const totalExpenses = roundCurrency(expensesReal + expensesFuture);
  const summary: VatFiscalSummary = {
    fiscalYear,
    collectedReal: roundCurrency(collectedReal),
    collectedFuture: roundCurrency(futureToCollect + manualInflowsVat),
    totalCollected: roundCurrency(totalCollected),
    deductibleReal: roundCurrency(deductibleReal),
    deductibleFuture: roundCurrency(futureToDeduct + manualOutflowsVat),
    totalDeductible: roundCurrency(totalDeductible),
    rawBalance,
    ...balanceStatus,
    threshold,
    revenueReal: roundCurrency(revenueReal),
    revenueFuture: roundCurrency(revenueFuture),
    totalRevenue,
    expensesReal: roundCurrency(expensesReal),
    expensesFuture: roundCurrency(expensesFuture),
    totalExpenses,
    netResult: roundCurrency(totalRevenue - totalExpenses),
  };

  return {
    summary,
    items,
    details: {
      collectedReal: roundCurrency(collectedReal),
      deductibleReal: roundCurrency(deductibleReal),
      futureToCollect: roundCurrency(futureToCollect),
      futureToDeduct: roundCurrency(futureToDeduct),
      futureForecastFlowsVat: roundCurrency(futureForecastFlowsVat),
    },
  };
}

function addVatItemIfPositive(items: VatItem[], vatAmount: number, item: Omit<VatItem, "vatAmount">): void {
  if (vatAmount > 0) items.push({ ...item, vatAmount });
}

function sumFlows(
  flows: ExpandedFlow[],
  type: ExpandedFlow["type"],
  field: "vatAmount" | "amountTtc",
): number {
  return flows.filter((flow) => flow.type === type).reduce((total, flow) => total + flow[field], 0);
}

function getBalanceStatus(rawBalance: number, threshold: number): Pick<
  VatFiscalSummary,
  "status" | "statusLabel" | "vatToProvision" | "refundableVat" | "carriedOverVat"
> {
  if (rawBalance > 0) {
    return {
      status: "due",
      statusLabel: "TVA nette à décaisser / provisionner",
      vatToProvision: rawBalance,
      refundableVat: 0,
      carriedOverVat: 0,
    };
  }

  if (rawBalance < 0) {
    const credit = Math.abs(rawBalance);
    if (credit >= threshold) {
      return {
        status: "credit_refundable",
        statusLabel: `Crédit de TVA remboursable (≥ ${threshold} €)`,
        vatToProvision: 0,
        refundableVat: roundCurrency(credit),
        carriedOverVat: 0,
      };
    }
    return {
      status: "credit_carried_over",
      statusLabel: `Crédit reporté (inférieur au seuil de ${threshold} €)`,
      vatToProvision: 0,
      refundableVat: 0,
      carriedOverVat: roundCurrency(credit),
    };
  }

  return {
    status: "due",
    statusLabel: "TVA équilibrée (0,00 €)",
    vatToProvision: 0,
    refundableVat: 0,
    carriedOverVat: 0,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
