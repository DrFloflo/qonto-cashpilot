import { db } from "@/db";
import {
  accounts,
  transactions,
  customerInvoices,
  supplierInvoices,
  futureFlows,
  syncStates,
  appSettings,
  type FutureFlow,
  type Transaction,
  type AppSettings,
} from "@/db/schema";
import { addDays, addMonths, isBefore, isAfter, parseISO, startOfMonth, endOfMonth, format } from "date-fns";

export interface VatItem {
  id: string;
  source: "Facture Client (Encaissée)" | "Facture Fournisseur (Payée)" | "Facture Client (À encaisser)" | "Facture Fournisseur (À décaisser)" | "Flux Futur";
  label: string;
  date: string;
  type: "collectee" | "deductible";
  amountHt: number;
  vatRate?: number;
  vatAmount: number;
}

export interface FiscalYearInfo {
  endDay: number;
  endMonth: number;
  startDateStr: string;
  endDateStr: string;
  label: string;
  regime: "normal_monthly" | "normal_quarterly" | "simplified";
  regimeLabel: string;
  paymentMethod: "debits" | "encaissements";
}

export interface VatFiscalSummary {
  fiscalYear: FiscalYearInfo;
  collectedReal: number;
  collectedFuture: number;
  totalCollected: number;
  deductibleReal: number;
  deductibleFuture: number;
  totalDeductible: number;
  rawBalance: number;
  status: "due" | "credit_refundable" | "credit_carried_over";
  statusLabel: string;
  threshold: number;
  vatToProvision: number;
  refundableVat: number;
  carriedOverVat: number;
}

export interface DashboardData {
  account: {
    id: string;
    name: string;
    balance: number;
    currency: string;
    updatedAt: string;
  };
  syncState: {
    lastSyncAt: string | null;
    status: string;
    errorMessage: string | null;
  };
  settings: AppSettings;
  kpis: {
    currentCash: number;
    projected30d: number;
    projected60d: number;
    projected90d: number;
    projected12m: number;
    vatToProvision: number;
    monthRevenue: number;
    monthExpenses: number;
    vatFiscalSummary: VatFiscalSummary;
    vatDetails: {
      collectedReal: number;
      deductibleReal: number;
      futureToCollect: number;
      futureToDeduct: number;
      futureForecastFlowsVat: number;
    };
    monthRevenueItems: Transaction[];
    monthExpenseItems: Transaction[];
    vatProvisionItems: VatItem[];
  };
  projectionChart: {
    past7d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
    past14d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
    past30d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
    past90d?: { timeframe30d: ChartPoint[]; timeframe60d: ChartPoint[]; timeframe90d: ChartPoint[]; timeframe12m: ChartPoint[] };
    timeframe30d: ChartPoint[];
    timeframe60d: ChartPoint[];
    timeframe90d: ChartPoint[];
    timeframe12m: ChartPoint[];
  };
  futureFlows: FutureFlow[];
}

export interface ChartDayOperation {
  id: string;
  label: string;
  category: string;
  amount: number;
  type: "inflow" | "outflow";
  source: "qonto_transaction" | "invoice_customer" | "invoice_supplier" | "future_flow";
}

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  label: string; // "16 sept."
  actualBalance?: number;
  projectedBalance?: number;
  inflow?: number;
  outflow?: number;
  isToday?: boolean;
  operations?: ChartDayOperation[];
}

export interface ExpandedFlow {
  date: string;
  type: "inflow" | "outflow";
  amountHt: number;
  vatAmount: number;
  amountTtc: number;
  label: string;
  category: string;
  source: "invoice_customer" | "invoice_supplier" | "future_flow";
}

function expandFutureFlows(flows: FutureFlow[], horizonDate: Date): ExpandedFlow[] {
  const expanded: ExpandedFlow[] = [];

  for (const flow of flows) {
    const startDate = parseISO(flow.date);
    const amountHt = flow.amountHt;
    const vatAmount = (amountHt * flow.vatRate) / 100;
    const amountTtc = amountHt + vatAmount;

    if (flow.recurrence === "none") {
      expanded.push({
        date: flow.date,
        type: flow.type as "inflow" | "outflow",
        amountHt,
        vatAmount,
        amountTtc,
        label: flow.label,
        category: flow.category,
        source: "future_flow",
      });
      continue;
    }

    let currentDate = startDate;
    let occurrences = 0;
    const maxOccurrences = 52;

    while (!isAfter(currentDate, horizonDate) && occurrences < maxOccurrences) {
      const dateStr = currentDate.toISOString().split("T")[0];
      expanded.push({
        date: dateStr,
        type: flow.type as "inflow" | "outflow",
        amountHt,
        vatAmount,
        amountTtc,
        label: `${flow.label}${occurrences > 0 ? " (récurrent)" : ""}`,
        category: flow.category,
        source: "future_flow",
      });

      occurrences++;
      if (flow.recurrence === "monthly") {
        currentDate = addMonths(currentDate, 1);
      } else if (flow.recurrence === "quarterly") {
        currentDate = addMonths(currentDate, 3);
      } else if (flow.recurrence === "yearly") {
        currentDate = addMonths(currentDate, 12);
      } else {
        break;
      }
    }
  }

  return expanded;
}

export function getFiscalYearBounds(now: Date, endDay: number, endMonth: number): {
  startDate: Date;
  endDate: Date;
  startDateStr: string;
  endDateStr: string;
} {
  const currentYear = now.getFullYear();
  const lastDayOfMonth = new Date(currentYear, endMonth, 0).getDate();
  const safeDay = Math.min(Math.max(1, endDay), lastDayOfMonth);
  const candidateEnd = new Date(currentYear, endMonth - 1, safeDay, 23, 59, 59, 999);

  let endDate: Date;
  if (now.getTime() <= candidateEnd.getTime()) {
    endDate = candidateEnd;
  } else {
    const nextYear = currentYear + 1;
    const nextLastDay = new Date(nextYear, endMonth, 0).getDate();
    endDate = new Date(nextYear, endMonth - 1, Math.min(safeDay, nextLastDay), 23, 59, 59, 999);
  }

  const startYear = endDate.getFullYear() - 1;
  const prevLastDay = new Date(startYear, endMonth, 0).getDate();
  const prevEnd = new Date(startYear, endMonth - 1, Math.min(safeDay, prevLastDay), 0, 0, 0, 0);
  const startDate = addDays(prevEnd, 1);
  startDate.setHours(0, 0, 0, 0);

  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(endDate, "yyyy-MM-dd");

  return { startDate, endDate, startDateStr, endDateStr };
}

export async function getDashboardData(): Promise<DashboardData> {
  const allAccounts = db.select().from(accounts).all();
  const allTransactions = db.select().from(transactions).all();
  const allCustomerInvoices = db.select().from(customerInvoices).all();
  const allSupplierInvoices = db.select().from(supplierInvoices).all();
  const allFutureFlows = db.select().from(futureFlows).all();
  const allSyncStates = db.select().from(syncStates).all();
  const allSettings = db.select().from(appSettings).all();

  const settings: AppSettings = allSettings[0] || {
    id: "default",
    fiscalYearEndDay: 31,
    fiscalYearEndMonth: 12,
    vatRegime: "normal_monthly",
    vatPaymentMethod: "debits",
    updatedAt: new Date().toISOString(),
  };

  const account = allAccounts[0] || {
    id: "default",
    name: "Compte Professionnel Qonto",
    currency: "EUR",
    balance: 0,
    balanceCents: 0,
    updatedAt: new Date().toISOString(),
  };

  const syncState = allSyncStates[0] || {
    id: "default",
    lastSyncAt: null,
    status: "idle",
    errorMessage: null,
  };

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const startMonth = startOfMonth(now);
  const endMonth = endOfMonth(now);

  // 1. Calculate Month Revenue & Month Expenses with exact items
  let monthRevenue = 0;
  let monthExpenses = 0;
  const monthRevenueItems: Transaction[] = [];
  const monthExpenseItems: Transaction[] = [];

  for (const tx of allTransactions) {
    const txDate = parseISO(tx.settledAt);
    if (!isBefore(txDate, startMonth) && !isAfter(txDate, endMonth)) {
      if (tx.side === "credit" || tx.amount > 0) {
        monthRevenue += Math.abs(tx.amount);
        monthRevenueItems.push(tx);
      } else {
        monthExpenses += Math.abs(tx.amount);
        monthExpenseItems.push(tx);
      }
    }
  }

  // Sort items recent first
  monthRevenueItems.sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  monthExpenseItems.sort((a, b) => b.settledAt.localeCompare(a.settledAt));

  // 2. VAT Calculation & Details List on the current Fiscal Year
  const fiscalBounds = getFiscalYearBounds(
    now,
    settings.fiscalYearEndDay,
    settings.fiscalYearEndMonth
  );

  const regimeLabels: Record<string, string> = {
    normal_monthly: "Régime Réel Normal (Mensuel)",
    normal_quarterly: "Régime Réel Normal (Trimestriel)",
    simplified: "Régime Réel Simplifié (RSI)",
  };

  const fiscalYearInfo: FiscalYearInfo = {
    endDay: settings.fiscalYearEndDay,
    endMonth: settings.fiscalYearEndMonth,
    startDateStr: fiscalBounds.startDateStr,
    endDateStr: fiscalBounds.endDateStr,
    label: `Exercice fiscal du ${format(fiscalBounds.startDate, "dd/MM/yyyy")} au ${format(fiscalBounds.endDate, "dd/MM/yyyy")}`,
    regime: settings.vatRegime as "normal_monthly" | "normal_quarterly" | "simplified",
    regimeLabel: regimeLabels[settings.vatRegime] || "Régime Réel Normal",
    paymentMethod: settings.vatPaymentMethod as "debits" | "encaissements",
  };

  const vatProvisionItems: VatItem[] = [];

  // Real VAT collected (paid customer invoices in current fiscal year)
  let collectedReal = 0;
  for (const cinv of allCustomerInvoices) {
    if (cinv.status === "paid") {
      const itemDate = (cinv.paidAt || cinv.issueDate).slice(0, 10);
      if (itemDate >= fiscalBounds.startDateStr && itemDate <= fiscalBounds.endDateStr) {
        collectedReal += cinv.totalVatAmount;
        if (cinv.totalVatAmount > 0) {
          vatProvisionItems.push({
            id: cinv.id,
            source: "Facture Client (Encaissée)",
            label: `${cinv.clientName} (${cinv.invoiceNumber})`,
            date: itemDate,
            type: "collectee",
            amountHt: cinv.totalAmountHt,
            vatAmount: cinv.totalVatAmount,
          });
        }
      }
    }
  }

  // Real VAT deductible (paid supplier invoices in current fiscal year)
  let deductibleReal = 0;
  for (const sinv of allSupplierInvoices) {
    if (sinv.status === "paid") {
      const itemDate = (sinv.paidAt || sinv.issueDate).slice(0, 10);
      if (itemDate >= fiscalBounds.startDateStr && itemDate <= fiscalBounds.endDateStr) {
        deductibleReal += sinv.totalVatAmount;
        if (sinv.totalVatAmount > 0) {
          vatProvisionItems.push({
            id: sinv.id,
            source: "Facture Fournisseur (Payée)",
            label: `${sinv.supplierName} (${sinv.invoiceNumber || "N/A"})`,
            date: itemDate,
            type: "deductible",
            amountHt: sinv.totalAmountHt,
            vatAmount: sinv.totalVatAmount,
          });
        }
      }
    }
  }

  // Future VAT to collect (unpaid customer invoices within remaining fiscal year)
  let futureToCollect = 0;
  for (const cinv of allCustomerInvoices) {
    if (cinv.status !== "paid" && cinv.status !== "canceled") {
      const dueDate = (cinv.dueDate || cinv.issueDate).slice(0, 10);
      if (dueDate >= todayStr && dueDate <= fiscalBounds.endDateStr) {
        futureToCollect += cinv.totalVatAmount;
        if (cinv.totalVatAmount > 0) {
          vatProvisionItems.push({
            id: cinv.id,
            source: "Facture Client (À encaisser)",
            label: `${cinv.clientName} (${cinv.invoiceNumber})`,
            date: dueDate,
            type: "collectee",
            amountHt: cinv.totalAmountHt,
            vatAmount: cinv.totalVatAmount,
          });
        }
      }
    }
  }

  // Future VAT to deduct (unpaid supplier invoices within remaining fiscal year)
  let futureToDeduct = 0;
  for (const sinv of allSupplierInvoices) {
    if (sinv.status !== "paid" && sinv.status !== "canceled") {
      const dueDate = (sinv.dueDate || sinv.issueDate).slice(0, 10);
      if (dueDate >= todayStr && dueDate <= fiscalBounds.endDateStr) {
        futureToDeduct += sinv.totalVatAmount;
        if (sinv.totalVatAmount > 0) {
          vatProvisionItems.push({
            id: sinv.id,
            source: "Facture Fournisseur (À décaisser)",
            label: `${sinv.supplierName} (${sinv.invoiceNumber || "N/A"})`,
            date: dueDate,
            type: "deductible",
            amountHt: sinv.totalAmountHt,
            vatAmount: sinv.totalVatAmount,
          });
        }
      }
    }
  }

  // 3. Expand Future Invoices + Future Manual Flows
  const horizon12m = addMonths(now, 12);
  const manualExpanded = expandFutureFlows(allFutureFlows, horizon12m);

  // Manual flows VAT within remaining fiscal year
  let futureForecastFlowsVat = 0;
  for (const flow of manualExpanded) {
    if (flow.date >= todayStr && flow.date <= fiscalBounds.endDateStr) {
      if (flow.type === "inflow") {
        futureForecastFlowsVat += flow.vatAmount;
      } else {
        futureForecastFlowsVat -= flow.vatAmount;
      }
      if (flow.vatAmount > 0) {
        vatProvisionItems.push({
          id: `future-${flow.label}-${flow.date}`,
          source: "Flux Futur",
          label: flow.label,
          date: flow.date,
          type: flow.type === "inflow" ? "collectee" : "deductible",
          amountHt: flow.amountHt,
          vatAmount: flow.vatAmount,
        });
      }
    }
  }

  // Sort VAT items by date descending
  vatProvisionItems.sort((a, b) => b.date.localeCompare(a.date));

  const manualInflowsVat = manualExpanded
    .filter((f) => f.date >= todayStr && f.date <= fiscalBounds.endDateStr && f.type === "inflow")
    .reduce((a, b) => a + b.vatAmount, 0);

  const manualOutflowsVat = manualExpanded
    .filter((f) => f.date >= todayStr && f.date <= fiscalBounds.endDateStr && f.type === "outflow")
    .reduce((a, b) => a + b.vatAmount, 0);

  const totalCollected = collectedReal + futureToCollect + manualInflowsVat;
  const totalDeductible = deductibleReal + futureToDeduct + manualOutflowsVat;
  const rawBalance = Math.round((totalCollected - totalDeductible) * 100) / 100;

  // French tax rules on refund & carry-over thresholds
  // Normal regime: 760 € minimum refund threshold; below 760 € -> carried over to next period
  // Simplified regime: 150 € annual refund threshold on CA12
  const isSimplified = settings.vatRegime === "simplified";
  const refundThreshold = isSimplified ? 150 : 760;

  let vatStatus: "due" | "credit_refundable" | "credit_carried_over";
  let statusLabel: string;
  let vatToProvision = 0;
  let refundableVat = 0;
  let carriedOverVat = 0;

  if (rawBalance > 0) {
    vatStatus = "due";
    statusLabel = "TVA nette à décaisser / provisionner";
    vatToProvision = rawBalance;
  } else if (rawBalance < 0) {
    const credit = Math.abs(rawBalance);
    if (credit >= refundThreshold) {
      vatStatus = "credit_refundable";
      statusLabel = `Crédit de TVA remboursable (≥ ${refundThreshold} €)`;
      refundableVat = credit;
    } else {
      vatStatus = "credit_carried_over";
      statusLabel = `Crédit reporté (inférieur au seuil de ${refundThreshold} €)`;
      carriedOverVat = credit;
    }
  } else {
    vatStatus = "due";
    statusLabel = "TVA équilibrée (0,00 €)";
  }

  const vatFiscalSummary: VatFiscalSummary = {
    fiscalYear: fiscalYearInfo,
    collectedReal: Math.round(collectedReal * 100) / 100,
    collectedFuture: Math.round((futureToCollect + manualInflowsVat) * 100) / 100,
    totalCollected: Math.round(totalCollected * 100) / 100,
    deductibleReal: Math.round(deductibleReal * 100) / 100,
    deductibleFuture: Math.round((futureToDeduct + manualOutflowsVat) * 100) / 100,
    totalDeductible: Math.round(totalDeductible * 100) / 100,
    rawBalance,
    status: vatStatus,
    statusLabel,
    threshold: refundThreshold,
    vatToProvision: Math.round(vatToProvision * 100) / 100,
    refundableVat: Math.round(refundableVat * 100) / 100,
    carriedOverVat: Math.round(carriedOverVat * 100) / 100,
  };

  // 4. Combine all future cash flows for projection timeline
  const allFutureEvents: ExpandedFlow[] = [...manualExpanded];

  for (const cinv of allCustomerInvoices) {
    if (cinv.status !== "paid" && cinv.status !== "canceled") {
      const dueDate = cinv.dueDate || todayStr;
      allFutureEvents.push({
        date: dueDate < todayStr ? todayStr : dueDate,
        type: "inflow",
        amountHt: cinv.totalAmountHt,
        vatAmount: cinv.totalVatAmount,
        amountTtc: cinv.totalAmountTtc,
        label: `Facture client: ${cinv.clientName} (${cinv.invoiceNumber})`,
        category: "CA / Vente",
        source: "invoice_customer",
      });
    }
  }

  for (const sinv of allSupplierInvoices) {
    if (sinv.status !== "paid" && sinv.status !== "canceled") {
      const dueDate = sinv.dueDate || todayStr;
      allFutureEvents.push({
        date: dueDate < todayStr ? todayStr : dueDate,
        type: "outflow",
        amountHt: sinv.totalAmountHt,
        vatAmount: sinv.totalVatAmount,
        amountTtc: sinv.totalAmountTtc,
        label: `Facture fournisseur: ${sinv.supplierName} (${sinv.invoiceNumber || "N/A"})`,
        category: "Fournisseur",
        source: "invoice_supplier",
      });
    }
  }

  const currentCash = account.balance;

  function calculateProjectedAt(days: number): number {
    const targetDate = addDays(now, days).toISOString().split("T")[0];
    let cash = currentCash;

    for (const event of allFutureEvents) {
      if (event.date >= todayStr && event.date <= targetDate) {
        if (event.type === "inflow") {
          cash += event.amountTtc;
        } else {
          cash -= event.amountTtc;
        }
      }
    }
    return Math.round(cash * 100) / 100;
  }

  const projected30d = calculateProjectedAt(30);
  const projected60d = calculateProjectedAt(60);
  const projected90d = calculateProjectedAt(90);
  const projected12m = calculateProjectedAt(365);

  // 5. Generate Chart Series with configurable past history and future projection horizon
  function generateChartSeries(pastDays: number = 30, daysAhead: number = 60, stepDays: number = 1): ChartPoint[] {
    const points: ChartPoint[] = [];

    const txByDate: Record<string, { inflow: number; outflow: number; net: number; settledBalance?: number; operations: ChartDayOperation[] }> = {};
    const sortedTx = [...allTransactions].sort((a, b) => a.settledAt.localeCompare(b.settledAt));

    for (const tx of sortedTx) {
      const d = tx.settledAt.split("T")[0];
      if (!txByDate[d]) {
        txByDate[d] = { inflow: 0, outflow: 0, net: 0, settledBalance: undefined, operations: [] };
      }
      const isCredit = tx.side === "credit" || tx.amount > 0;
      const absAmount = Math.abs(tx.amount);
      if (isCredit) {
        txByDate[d].inflow += absAmount;
        txByDate[d].net += absAmount;
      } else {
        txByDate[d].outflow += absAmount;
        txByDate[d].net -= absAmount;
      }
      if (tx.settledBalance !== null && tx.settledBalance !== undefined) {
        txByDate[d].settledBalance = tx.settledBalance;
      }
      txByDate[d].operations.push({
        id: tx.id,
        label: tx.label,
        category: tx.category || (isCredit ? "CA / Vente" : "Charge"),
        amount: absAmount,
        type: isCredit ? "inflow" : "outflow",
        source: "qonto_transaction",
      });
    }

    const startDate = addDays(now, -pastDays);
    const endDate = addDays(now, daysAhead);

    const futureByDate: Record<string, { inflow: number; outflow: number; operations: ChartDayOperation[] }> = {};
    for (const event of allFutureEvents) {
      if (!futureByDate[event.date]) {
        futureByDate[event.date] = { inflow: 0, outflow: 0, operations: [] };
      }
      if (event.type === "inflow") {
        futureByDate[event.date].inflow += event.amountTtc;
      } else {
        futureByDate[event.date].outflow += event.amountTtc;
      }
      futureByDate[event.date].operations.push({
        id: `future-${event.date}-${event.label}`,
        label: event.label,
        category: event.category,
        amount: event.amountTtc,
        type: event.type,
        source: event.source,
      });
    }

    const pastBalances: Record<string, number> = {};
    let backBalance = currentCash;
    for (let i = 0; i <= pastDays; i++) {
      const d = addDays(now, -i).toISOString().split("T")[0];
      const dayData = txByDate[d];
      if (dayData?.settledBalance !== undefined) {
        pastBalances[d] = dayData.settledBalance;
        backBalance = dayData.settledBalance - (dayData.net || 0);
      } else {
        pastBalances[d] = backBalance;
        if (dayData) {
          backBalance -= dayData.net;
        }
      }
    }

    let cur = new Date(startDate);
    let curProjected = currentCash;

    while (!isAfter(cur, endDate)) {
      const dStr = cur.toISOString().split("T")[0];
      const isToday = dStr === todayStr;
      const isPast = dStr < todayStr;

      let actualBalance: number | undefined = undefined;
      let projectedBalance: number | undefined = undefined;

      const dateLabel = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(cur);

      if (isPast) {
        actualBalance = pastBalances[dStr] ?? currentCash;
      } else if (isToday) {
        actualBalance = currentCash;
        projectedBalance = currentCash;
      } else {
        const eventsToday = futureByDate[dStr];
        if (eventsToday) {
          curProjected = curProjected + eventsToday.inflow - eventsToday.outflow;
        }
        projectedBalance = Math.round(curProjected * 100) / 100;
      }

      const dayInflow = isPast
        ? (txByDate[dStr]?.inflow || 0)
        : (isToday ? (txByDate[dStr]?.inflow || futureByDate[dStr]?.inflow || 0) : (futureByDate[dStr]?.inflow || 0));

      const dayOutflow = isPast
        ? (txByDate[dStr]?.outflow || 0)
        : (isToday ? (txByDate[dStr]?.outflow || futureByDate[dStr]?.outflow || 0) : (futureByDate[dStr]?.outflow || 0));

      const dayOperations: ChartDayOperation[] = [];
      if (isPast) {
        if (txByDate[dStr]?.operations) {
          dayOperations.push(...txByDate[dStr].operations);
        }
      } else if (isToday) {
        if (txByDate[dStr]?.operations) {
          dayOperations.push(...txByDate[dStr].operations);
        }
        if (futureByDate[dStr]?.operations) {
          dayOperations.push(...futureByDate[dStr].operations);
        }
      } else {
        if (futureByDate[dStr]?.operations) {
          dayOperations.push(...futureByDate[dStr].operations);
        }
      }

      points.push({
        date: dStr,
        label: dateLabel,
        actualBalance: actualBalance !== undefined ? Math.round(actualBalance * 100) / 100 : undefined,
        projectedBalance: projectedBalance !== undefined ? Math.round(projectedBalance * 100) / 100 : undefined,
        inflow: dayInflow > 0 ? Math.round(dayInflow * 100) / 100 : undefined,
        outflow: dayOutflow > 0 ? Math.round(dayOutflow * 100) / 100 : undefined,
        isToday,
        operations: dayOperations.length > 0 ? dayOperations : undefined,
      });

      cur = addDays(cur, stepDays);
    }

    return points;
  }

  return {
    account: {
      id: account.id,
      name: account.name,
      balance: account.balance,
      currency: account.currency,
      updatedAt: account.updatedAt,
    },
    syncState: {
      lastSyncAt: syncState.lastSyncAt,
      status: syncState.status || "idle",
      errorMessage: syncState.errorMessage,
    },
    settings,
    kpis: {
      currentCash,
      projected30d,
      projected60d,
      projected90d,
      projected12m,
      vatToProvision,
      monthRevenue,
      monthExpenses,
      vatFiscalSummary,
      vatDetails: {
        collectedReal,
        deductibleReal,
        futureToCollect,
        futureToDeduct,
        futureForecastFlowsVat,
      },
      monthRevenueItems,
      monthExpenseItems,
      vatProvisionItems,
    },
    projectionChart: {
      past7d: {
        timeframe30d: generateChartSeries(7, 30, 1),
        timeframe60d: generateChartSeries(7, 60, 1),
        timeframe90d: generateChartSeries(7, 90, 1),
        timeframe12m: generateChartSeries(7, 365, 1),
      },
      past14d: {
        timeframe30d: generateChartSeries(14, 30, 1),
        timeframe60d: generateChartSeries(14, 60, 1),
        timeframe90d: generateChartSeries(14, 90, 1),
        timeframe12m: generateChartSeries(14, 365, 1),
      },
      past30d: {
        timeframe30d: generateChartSeries(30, 30, 1),
        timeframe60d: generateChartSeries(30, 60, 1),
        timeframe90d: generateChartSeries(30, 90, 1),
        timeframe12m: generateChartSeries(30, 365, 1),
      },
      past90d: {
        timeframe30d: generateChartSeries(90, 30, 1),
        timeframe60d: generateChartSeries(90, 60, 1),
        timeframe90d: generateChartSeries(90, 90, 1),
        timeframe12m: generateChartSeries(90, 365, 1),
      },
      timeframe30d: generateChartSeries(30, 30, 1),
      timeframe60d: generateChartSeries(30, 60, 1),
      timeframe90d: generateChartSeries(30, 90, 1),
      timeframe12m: generateChartSeries(30, 365, 1),
    },
    futureFlows: allFutureFlows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
