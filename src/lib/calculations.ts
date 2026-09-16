import { db } from "@/db";
import {
  accounts,
  appSettings,
  collaborators,
  customerInvoices,
  expenseItems,
  futureFlows,
  supplierInvoices,
  syncStates,
  transactions,
  type AppSettings,
} from "@/db/schema";
import { addDays, addMonths } from "date-fns";
import { buildFutureEvents, expandFutureFlows } from "./calculations/flows";
import { calculateMonthlyTransactions } from "./calculations/monthly";
import { calculateProjectedCash, generateProjectionTimeframes } from "./calculations/projection";
import type { DashboardData } from "./calculations/types";
import { computeVatForFiscalYear } from "./calculations/vat";

export { getFiscalYearBounds } from "./calculations/fiscal-year";
export type {
  ChartDayOperation,
  ChartPoint,
  DashboardData,
  ExpandedFlow,
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
  updatedAt: new Date().toISOString(),
});

export async function getDashboardData(): Promise<DashboardData> {
  const allAccounts = db.select().from(accounts).all();
  const allTransactions = db.select().from(transactions).all();
  const allCustomerInvoices = db.select().from(customerInvoices).all();
  const allSupplierInvoices = db.select().from(supplierInvoices).all();
  const allFutureFlows = db.select().from(futureFlows).all();
  const allSyncStates = db.select().from(syncStates).all();
  const allSettings = db.select().from(appSettings).all();
  const allCollaborators = db.select().from(collaborators).all();
  const allExpenseItems = db.select().from(expenseItems).all();

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
  const manualFlows = expandFutureFlows(allFutureFlows, addMonths(now, 12));
  const vatInput = {
    now,
    todayStr,
    settings,
    transactions: allTransactions,
    customerInvoices: allCustomerInvoices,
    supplierInvoices: allSupplierInvoices,
    expenseItems: allExpenseItems,
    collaboratorNames,
    manualFlows,
  };
  const currentVat = computeVatForFiscalYear(vatInput);
  const previousVat = computeVatForFiscalYear({ ...vatInput, offsetYears: -1 });
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
      monthRevenue: monthly.revenue,
      monthExpenses: monthly.expenses,
      vatFiscalSummary: currentVat.summary,
      vatPreviousFiscalSummary: previousVat.summary,
      vatDetails: currentVat.details,
      monthRevenueItems: monthly.revenueItems,
      monthExpenseItems: monthly.expenseItems,
      vatProvisionItems: currentVat.items,
      previousVatProvisionItems: previousVat.items,
    },
    projectionChart: {
      past7d: projectionForPast(7),
      past14d: projectionForPast(14),
      past30d: projectionForPast(30),
      past90d: projectionForPast(90),
      ...projectionForPast(30),
    },
    futureFlows: allFutureFlows.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
