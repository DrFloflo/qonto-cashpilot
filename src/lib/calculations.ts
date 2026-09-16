import { db } from "@/db";
import {
  accounts,
  transactions,
  customerInvoices,
  supplierInvoices,
  futureFlows,
  syncStates,
  type FutureFlow,
  type Transaction,
} from "@/db/schema";
import { addDays, addMonths, isBefore, isAfter, parseISO, startOfMonth, endOfMonth } from "date-fns";

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
  kpis: {
    currentCash: number;
    projected30d: number;
    projected60d: number;
    projected90d: number;
    projected12m: number;
    vatToProvision: number;
    monthRevenue: number;
    monthExpenses: number;
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

export async function getDashboardData(): Promise<DashboardData> {
  const allAccounts = db.select().from(accounts).all();
  const allTransactions = db.select().from(transactions).all();
  const allCustomerInvoices = db.select().from(customerInvoices).all();
  const allSupplierInvoices = db.select().from(supplierInvoices).all();
  const allFutureFlows = db.select().from(futureFlows).all();
  const allSyncStates = db.select().from(syncStates).all();

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

  // 2. VAT Calculation & Details List
  const vatProvisionItems: VatItem[] = [];

  // Real VAT collected (paid customer invoices)
  let collectedReal = 0;
  for (const cinv of allCustomerInvoices) {
    if (cinv.status === "paid") {
      collectedReal += cinv.totalVatAmount;
      if (cinv.totalVatAmount > 0) {
        vatProvisionItems.push({
          id: cinv.id,
          source: "Facture Client (Encaissée)",
          label: `${cinv.clientName} (${cinv.invoiceNumber})`,
          date: cinv.paidAt || cinv.issueDate,
          type: "collectee",
          amountHt: cinv.totalAmountHt,
          vatAmount: cinv.totalVatAmount,
        });
      }
    }
  }

  // Real VAT deductible (paid supplier invoices)
  let deductibleReal = 0;
  for (const sinv of allSupplierInvoices) {
    if (sinv.status === "paid") {
      deductibleReal += sinv.totalVatAmount;
      if (sinv.totalVatAmount > 0) {
        vatProvisionItems.push({
          id: sinv.id,
          source: "Facture Fournisseur (Payée)",
          label: `${sinv.supplierName} (${sinv.invoiceNumber || "N/A"})`,
          date: sinv.paidAt || sinv.issueDate,
          type: "deductible",
          amountHt: sinv.totalAmountHt,
          vatAmount: sinv.totalVatAmount,
        });
      }
    }
  }

  // Future VAT to collect (unpaid customer invoices)
  let futureToCollect = 0;
  for (const cinv of allCustomerInvoices) {
    if (cinv.status !== "paid" && cinv.status !== "canceled") {
      futureToCollect += cinv.totalVatAmount;
      if (cinv.totalVatAmount > 0) {
        vatProvisionItems.push({
          id: cinv.id,
          source: "Facture Client (À encaisser)",
          label: `${cinv.clientName} (${cinv.invoiceNumber})`,
          date: cinv.dueDate || cinv.issueDate,
          type: "collectee",
          amountHt: cinv.totalAmountHt,
          vatAmount: cinv.totalVatAmount,
        });
      }
    }
  }

  // Future VAT to deduct (unpaid supplier invoices)
  let futureToDeduct = 0;
  for (const sinv of allSupplierInvoices) {
    if (sinv.status !== "paid" && sinv.status !== "canceled") {
      futureToDeduct += sinv.totalVatAmount;
      if (sinv.totalVatAmount > 0) {
        vatProvisionItems.push({
          id: sinv.id,
          source: "Facture Fournisseur (À décaisser)",
          label: `${sinv.supplierName} (${sinv.invoiceNumber || "N/A"})`,
          date: sinv.dueDate || sinv.issueDate,
          type: "deductible",
          amountHt: sinv.totalAmountHt,
          vatAmount: sinv.totalVatAmount,
        });
      }
    }
  }

  // 3. Expand Future Invoices + Future Manual Flows
  const horizon12m = addMonths(now, 12);
  const manualExpanded = expandFutureFlows(allFutureFlows, horizon12m);

  // Manual flows VAT
  let futureForecastFlowsVat = 0;
  for (const flow of manualExpanded) {
    if (flow.date >= todayStr) {
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

  const totalCollected = collectedReal + futureToCollect + manualExpanded.filter(f => f.date >= todayStr && f.type === "inflow").reduce((a, b) => a + b.vatAmount, 0);
  const totalDeductible = deductibleReal + futureToDeduct + manualExpanded.filter(f => f.date >= todayStr && f.type === "outflow").reduce((a, b) => a + b.vatAmount, 0);
  const vatToProvision = Math.max(0, totalCollected - totalDeductible);

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
    kpis: {
      currentCash,
      projected30d,
      projected60d,
      projected90d,
      projected12m,
      vatToProvision,
      monthRevenue,
      monthExpenses,
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
        timeframe60d: generateChartSeries(7, 60, 2),
        timeframe90d: generateChartSeries(7, 90, 3),
        timeframe12m: generateChartSeries(7, 365, 7),
      },
      past14d: {
        timeframe30d: generateChartSeries(14, 30, 1),
        timeframe60d: generateChartSeries(14, 60, 2),
        timeframe90d: generateChartSeries(14, 90, 3),
        timeframe12m: generateChartSeries(14, 365, 7),
      },
      past30d: {
        timeframe30d: generateChartSeries(30, 30, 1),
        timeframe60d: generateChartSeries(30, 60, 2),
        timeframe90d: generateChartSeries(30, 90, 3),
        timeframe12m: generateChartSeries(30, 365, 7),
      },
      past90d: {
        timeframe30d: generateChartSeries(90, 30, 1),
        timeframe60d: generateChartSeries(90, 60, 2),
        timeframe90d: generateChartSeries(90, 90, 3),
        timeframe12m: generateChartSeries(90, 365, 7),
      },
      timeframe30d: generateChartSeries(30, 30, 1),
      timeframe60d: generateChartSeries(30, 60, 2),
      timeframe90d: generateChartSeries(30, 90, 3),
      timeframe12m: generateChartSeries(30, 365, 7),
    },
    futureFlows: allFutureFlows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
