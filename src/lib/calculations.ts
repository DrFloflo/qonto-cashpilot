import { db } from "@/db";
import {
  accounts,
  appSettings,
  collaborators,
  customerInvoices,
  expenseItems,
  expenseReimbursements,
  fixedAssetDisposals,
  fixedAssets,
  fixedAssetSources,
  futureFlows,
  supplierInvoices,
  syncStates,
  transactions,
  type AppSettings,
} from "@/db/schema";
import { addDays, addMonths } from "date-fns";
import { buildFiscalYearChart } from "./calculations/fiscal-chart";
import { getFiscalYearBounds } from "./calculations/fiscal-year";
import { buildFutureEvents, expandFutureFlows } from "./calculations/flows";
import { calculateMonthlyTransactions } from "./calculations/monthly";
import { calculateProjectedCash, generateProjectionTimeframes } from "./calculations/projection";
import type { DashboardData, VatYearData } from "./calculations/types";
import { computeVatForFiscalYear } from "./calculations/vat";
import { syncAutomaticRecurringFlows } from "./recurring-transactions";

export { getFiscalYearBounds } from "./calculations/fiscal-year";
export type {
  ChartDayOperation,
  ChartPoint,
  DashboardData,
  ExpandedFlow,
  FiscalMonthPoint,
  FiscalYearChartData,
  FiscalYearInfo,
  VatFiscalSummary,
  VatItem,
  VatYearData,
} from "./calculations/types";

const DEFAULT_SETTINGS = (): AppSettings => ({
  id: "default",
  fiscalYearEndDay: 31,
  fiscalYearEndMonth: 12,
  vatRegime: "normal_monthly",
  vatPaymentMethod: "debits",
  fixedAssetThresholdCents: 50000,
  updatedAt: new Date().toISOString(),
});

export async function getDashboardData(): Promise<DashboardData> {
  // Also run detection when loading the dashboard so existing transaction
  // history is converted without requiring a new Qonto synchronization.
  syncAutomaticRecurringFlows();

  const allAccounts = db.select().from(accounts).all();
  const allTransactions = db.select().from(transactions).all();
  const allCustomerInvoices = db.select().from(customerInvoices).all();
  const allSupplierInvoices = db.select().from(supplierInvoices).all();
  const allFutureFlows = db.select().from(futureFlows).all();
  const allSyncStates = db.select().from(syncStates).all();
  const allSettings = db.select().from(appSettings).all();
  const allCollaborators = db.select().from(collaborators).all();
  const allExpenseItems = db.select().from(expenseItems).all();
  const allExpenseReimbursements = db.select().from(expenseReimbursements).all();
  const allFixedAssets = db.select().from(fixedAssets).all();
  const allFixedAssetDisposals = db.select().from(fixedAssetDisposals).all();
  const allFixedAssetSources = db.select().from(fixedAssetSources).all();

  const settings = allSettings[0] || DEFAULT_SETTINGS();
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
  const collaboratorNames = new Map(allCollaborators.map((collaborator) => [collaborator.id, collaborator.name]));
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const monthly = calculateMonthlyTransactions(allTransactions, now);
  const activeFlows = allFutureFlows.filter((flow) => flow.enabled);
  const fiscalYearBounds = getFiscalYearBounds(
    now,
    settings.fiscalYearEndDay,
    settings.fiscalYearEndMonth,
  );
  const expansionHorizon = fiscalYearBounds.endDate > addMonths(now, 12)
    ? fiscalYearBounds.endDate
    : addMonths(now, 12);
  const manualFlows = expandFutureFlows(activeFlows, expansionHorizon);
  const vatInput = {
    now,
    todayStr,
    settings,
    transactions: allTransactions,
    customerInvoices: allCustomerInvoices,
    supplierInvoices: allSupplierInvoices,
    expenseItems: allExpenseItems,
    reimbursements: allExpenseReimbursements,
    fixedAssets: allFixedAssets,
    fixedAssetDisposals: allFixedAssetDisposals,
    fixedAssetSources: allFixedAssetSources,
    collaboratorNames,
    manualFlows,
  };
  const oldestVatDate = getOldestVatDate(
    allTransactions,
    allCustomerInvoices,
    allSupplierInvoices,
    allExpenseItems,
    activeFlows,
  );
  const oldestFiscalOffset = getOldestFiscalOffset(
    now,
    settings,
    oldestVatDate,
  );
  const vatFiscalYears: VatYearData[] = [];
  const fiscalYearCharts: DashboardData["fiscalYearCharts"] = [];
  let openingVatCredit = 0;

  for (let offset = oldestFiscalOffset; offset <= 0; offset++) {
    const calculation = computeVatForFiscalYear({
      ...vatInput,
      offsetYears: offset,
      openingVatCredit,
    });
    vatFiscalYears.push({
      offset,
      vatFiscalSummary: calculation.summary,
      vatProvisionItems: calculation.items,
    });
    const bounds = getFiscalYearBounds(
      now,
      settings.fiscalYearEndDay,
      settings.fiscalYearEndMonth,
      offset,
    );
    fiscalYearCharts.push({
      offset,
      data: buildFiscalYearChart({
        fiscalStart: bounds.startDate,
        fiscalEnd: bounds.endDate,
        todayStr,
        currentCash: account.balance,
        transactions: allTransactions,
        futureEvents: [],
      }),
    });
    openingVatCredit = calculation.summary.carriedOverVat;
  }

  vatFiscalYears.reverse();
  fiscalYearCharts.reverse();
  const currentVatYear = vatFiscalYears[0];
  const currentVat = computeVatForFiscalYear({
    ...vatInput,
    openingVatCredit: currentVatYear.vatFiscalSummary.openingVatCredit,
  });
  const futureEvents = buildFutureEvents(
    manualFlows,
    allCustomerInvoices,
    allSupplierInvoices,
    todayStr,
  );
  const currentCash = account.balance;
  const projectionInput = {
    now,
    todayStr,
    currentCash,
    transactions: allTransactions,
    futureEvents,
    stepDays: 1,
  };
  const projectionForPast = (pastDays: number) => generateProjectionTimeframes({
    ...projectionInput,
    pastDays,
  });
  const projectedAt = (days: number) => calculateProjectedCash(
    currentCash,
    futureEvents,
    todayStr,
    addDays(now, days).toISOString().split("T")[0],
  );

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
      projected30d: projectedAt(30),
      projected60d: projectedAt(60),
      projected90d: projectedAt(90),
      projected12m: projectedAt(365),
      vatToProvision: currentVat.summary.vatToProvision,
      monthInflows: monthly.inflows,
      monthOutflows: monthly.outflows,
      vatFiscalSummary: currentVat.summary,
      vatFiscalYears,
      vatDetails: currentVat.details,
      monthInflowItems: monthly.inflowItems,
      monthOutflowItems: monthly.outflowItems,
      vatProvisionItems: currentVat.items,
    },
    projectionChart: {
      past7d: projectionForPast(7),
      past14d: projectionForPast(14),
      past30d: projectionForPast(30),
      past90d: projectionForPast(90),
      ...projectionForPast(30),
    },
    fiscalYearCharts: fiscalYearCharts.map((chart) => chart.offset === 0
      ? {
          offset: 0,
          data: buildFiscalYearChart({
            fiscalStart: fiscalYearBounds.startDate,
            fiscalEnd: fiscalYearBounds.endDate,
            todayStr,
            currentCash,
            transactions: allTransactions,
            futureEvents,
          }),
        }
      : chart),
    futureFlows: allFutureFlows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function getOldestVatDate(
  transactionRows: typeof transactions.$inferSelect[],
  customerInvoiceRows: typeof customerInvoices.$inferSelect[],
  supplierInvoiceRows: typeof supplierInvoices.$inferSelect[],
  expenseRows: typeof expenseItems.$inferSelect[],
  futureFlowRows: typeof futureFlows.$inferSelect[],
): string | null {
  const dates = [
    ...transactionRows.map((transaction) => transaction.settledAt.slice(0, 10)),
    ...customerInvoiceRows.map((invoice) => (invoice.paidAt || invoice.issueDate).slice(0, 10)),
    ...supplierInvoiceRows.map((invoice) => (invoice.paidAt || invoice.issueDate).slice(0, 10)),
    ...expenseRows.map((expense) => expense.date.slice(0, 10)),
    ...futureFlowRows.map((flow) => flow.date.slice(0, 10)),
  ].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

  return dates.length > 0 ? dates.sort()[0] : null;
}

function getOldestFiscalOffset(
  now: Date,
  settings: AppSettings,
  oldestDate: string | null,
): number {
  if (!oldestDate) return 0;

  let offset = 0;
  while (
    oldestDate < getFiscalYearBounds(
      now,
      settings.fiscalYearEndDay,
      settings.fiscalYearEndMonth,
      offset,
    ).startDateStr
  ) {
    offset--;
  }
  return offset;
}
