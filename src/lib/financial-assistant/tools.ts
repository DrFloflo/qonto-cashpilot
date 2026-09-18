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
  futureFlows,
  supplierInvoices,
  syncStates,
  transactions,
} from "@/db/schema";
import { getDashboardData, getFiscalYearBounds } from "@/lib/calculations";
import { buildFutureEvents, expandFutureFlows } from "@/lib/calculations/flows";
import { generateChartSeries } from "@/lib/calculations/projection";
import { buildMonthlyDepreciationSchedule } from "@/lib/calculations/depreciation";

export const MAX_TOOL_ROWS = 100;
export const DEFAULT_TOOL_ROWS = 25;

export interface ToolSource {
  label: string;
  count: number;
  dateFrom?: string;
  dateTo?: string;
  freshness?: string | null;
}

export interface ToolResult {
  period: { dateFrom: string | null; dateTo: string | null };
  filters: Record<string, unknown>;
  total: number;
  returned: number;
  offset: number;
  freshness: string | null;
  sources: ToolSource[];
  data: unknown;
}

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
export interface AssistantToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: JsonSchema };
}

const paginationProperties = {
  limit: { type: "integer", minimum: 1, maximum: MAX_TOOL_ROWS, description: "25 par défaut, 100 maximum" },
  offset: { type: "integer", minimum: 0, maximum: 10000 },
};
const dateProperties = {
  dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
};

function schema(properties: Record<string, unknown>, required?: string[]): JsonSchema {
  return { type: "object", properties, required, additionalProperties: false };
}

export const assistantToolDefinitions: AssistantToolDefinition[] = [
  tool("get_company_context", "Contexte synthétique, paramètres, KPI, fraîcheur et comptages.", schema({})),
  tool("get_financial_indicators", "Indicateurs déterministes du dashboard et synthèse fiscale.", schema({ fiscalYearOffset: { type: "integer", minimum: -20, maximum: 0 }, includeVatDetails: { type: "boolean" }, includeActivityDetails: { type: "boolean" } })),
  tool("search_transactions", "Recherche bornée dans les transactions bancaires, sans rawJson.", schema({ ...dateProperties, side: { type: "string", enum: ["credit", "debit", "all"] }, query: { type: "string", maxLength: 100 }, category: { type: "string", maxLength: 100 }, minAmountCents: { type: "integer", minimum: 0 }, maxAmountCents: { type: "integer", minimum: 0 }, hasVat: { type: "boolean" }, sort: { type: "string", enum: ["date_desc", "date_asc", "amount_desc"] }, ...paginationProperties })),
  tool("search_customer_invoices", "Recherche de factures clients, avec HT, TVA, TTC et échéances.", invoiceSchema("clientName")),
  tool("search_supplier_invoices", "Recherche de factures fournisseurs, avec HT, TVA, TTC et échéances.", invoiceSchema("supplierName")),
  tool("search_expense_items", "Recherche de notes de frais et indemnités kilométriques.", schema({ ...dateProperties, collaborator: { type: "string", maxLength: 100 }, type: { type: "string", enum: ["ndf", "ik", "all"] }, accountingStatus: { type: "string", maxLength: 50 }, query: { type: "string", maxLength: 100 }, minAmountCents: { type: "integer", minimum: 0 }, maxAmountCents: { type: "integer", minimum: 0 }, ...paginationProperties })),
  tool("get_expense_reimbursement_summary", "Sommes dues, remboursées et restant à payer par collaborateur.", schema({ collaborator: { type: "string", maxLength: 100 }, asOfDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, includeReimbursements: { type: "boolean" } })),
  tool("search_fixed_assets", "Recherche dans le registre des immobilisations.", schema({ ...dateProperties, status: { type: "string", maxLength: 50 }, category: { type: "string", maxLength: 100 }, supplier: { type: "string", maxLength: 100 }, query: { type: "string", maxLength: 100 }, belowThresholdOnly: { type: "boolean" }, ...paginationProperties })),
  tool("get_fixed_asset_schedule", "Plan d’amortissement déterministe mensuel ou annuel d’une immobilisation.", schema({ assetId: { type: "string", minLength: 1, maxLength: 200 }, granularity: { type: "string", enum: ["monthly", "annual"] }, fiscalYearOffset: { type: "integer", minimum: -20, maximum: 20 } }, ["assetId"])),
  tool("search_future_flows", "Recherche des flux futurs manuels ou automatiques.", schema({ ...dateProperties, side: { type: "string", enum: ["inflow", "outflow", "all"] }, category: { type: "string", maxLength: 100 }, origin: { type: "string", enum: ["manual", "automatic", "all"] }, enabled: { type: "boolean" }, recurrence: { type: "string", enum: ["none", "monthly", "quarterly", "yearly", "all"] }, ...paginationProperties })),
  tool("get_cash_projection", "Projection de trésorerie calculée par le moteur existant.", schema({ horizonDays: { type: "integer", minimum: 1, maximum: 365 }, granularityDays: { type: "integer", minimum: 1, maximum: 31 }, includeOperations: { type: "boolean" } })),
];

function tool(name: string, description: string, parameters: JsonSchema): AssistantToolDefinition {
  return { type: "function", function: { name, description, parameters } };
}

function invoiceSchema(nameField: "clientName" | "supplierName"): JsonSchema {
  return schema({ ...dateProperties, dateField: { type: "string", enum: ["issue", "due"] }, status: { type: "string", maxLength: 50 }, [nameField]: { type: "string", maxLength: 100 }, invoiceNumber: { type: "string", maxLength: 100 }, minAmountCents: { type: "integer", minimum: 0 }, maxAmountCents: { type: "integer", minimum: 0 }, overdueOnly: { type: "boolean" }, sort: { type: "string", enum: ["date_desc", "date_asc", "amount_desc"] }, ...paginationProperties });
}

export async function executeAssistantTool(name: string, rawArguments: unknown): Promise<ToolResult> {
  const args = objectArgs(rawArguments);
  switch (name) {
    case "get_company_context": return companyContextResult();
    case "get_financial_indicators": return financialIndicators(args);
    case "search_transactions": return searchTransactions(args);
    case "search_customer_invoices": return searchInvoices("customer", args);
    case "search_supplier_invoices": return searchInvoices("supplier", args);
    case "search_expense_items": return searchExpenses(args);
    case "get_expense_reimbursement_summary": return reimbursementSummary(args);
    case "search_fixed_assets": return searchAssets(args);
    case "get_fixed_asset_schedule": return assetSchedule(args);
    case "search_future_flows": return searchFlows(args);
    case "get_cash_projection": return cashProjection(args);
    default: throw new Error("Outil non autorisé.");
  }
}

export async function buildFinancialContext() {
  const result = await companyContextResult();
  return result.data;
}

async function companyContextResult(): Promise<ToolResult> {
  const dashboard = await getDashboardData();
  const bounds = getFiscalYearBounds(new Date(), dashboard.settings.fiscalYearEndDay, dashboard.settings.fiscalYearEndMonth);
  const counts = {
    transactions: db.select({ id: transactions.id }).from(transactions).all().length,
    customerInvoices: db.select({ id: customerInvoices.id }).from(customerInvoices).all().length,
    supplierInvoices: db.select({ id: supplierInvoices.id }).from(supplierInvoices).all().length,
    expenses: db.select({ id: expenseItems.id }).from(expenseItems).all().length,
    reimbursements: db.select({ id: expenseReimbursements.id }).from(expenseReimbursements).all().length,
    fixedAssets: db.select({ id: fixedAssets.id }).from(fixedAssets).all().length,
    futureFlows: db.select({ id: futureFlows.id }).from(futureFlows).all().length,
  };
  const summary = dashboard.kpis.vatFiscalSummary;
  const data = {
    currentDate: localIsoDate(), timezone: "Europe/Paris",
    account: dashboard.account,
    synchronization: dashboard.syncState,
    fiscalSettings: dashboard.settings,
    fiscalYear: { startDate: bounds.startDateStr, endDate: bounds.endDateStr, label: `${bounds.startDateStr} – ${bounds.endDateStr}` },
    kpis: { currentCash: dashboard.kpis.currentCash, projected30d: dashboard.kpis.projected30d, projected60d: dashboard.kpis.projected60d, projected90d: dashboard.kpis.projected90d, projected12m: dashboard.kpis.projected12m, monthInflows: dashboard.kpis.monthInflows, monthOutflows: dashboard.kpis.monthOutflows },
    vat: { vatToProvision: summary.vatToProvision, collectedReal: summary.collectedReal, deductibleReal: summary.deductibleReal, status: summary.statusLabel },
    accountingActivity: { revenueRealHt: summary.revenueReal, expensesRealHt: summary.expensesReal, balanceHt: summary.activityBalance },
    counts,
    warnings: freshnessWarnings(dashboard.syncState.lastSyncAt, dashboard.syncState.status, counts.transactions),
  };
  return result(data, Object.values(counts).reduce((sum, count) => sum + count, 0), [{ label: "Contexte financier et paramètres", count: 1, freshness: dashboard.syncState.lastSyncAt }], {}, null, null, 0);
}

async function financialIndicators(args: Record<string, unknown>): Promise<ToolResult> {
  const dashboard = await getDashboardData();
  const offset = boundedInteger(args.fiscalYearOffset, 0, -20, 0, "fiscalYearOffset");
  const year = dashboard.kpis.vatFiscalYears.find((item) => item.offset === offset);
  if (!year) throw new Error("Exercice fiscal indisponible.");
  const data: Record<string, unknown> = { cash: { current: dashboard.kpis.currentCash, projected30d: dashboard.kpis.projected30d, projected60d: dashboard.kpis.projected60d, projected90d: dashboard.kpis.projected90d, projected12m: dashboard.kpis.projected12m }, monthCashFlows: { inflowsTtc: dashboard.kpis.monthInflows, outflowsTtc: dashboard.kpis.monthOutflows }, vatSummary: year.vatFiscalSummary, assumptions: ["Projection déterministe fondée sur le solde actuel, les factures ouvertes et les flux futurs actifs.", "Activité comptable exprimée en HT ; trésorerie exprimée en TTC."] };
  if (boolean(args.includeVatDetails, false)) data.vatItems = year.vatProvisionItems.slice(0, MAX_TOOL_ROWS);
  if (boolean(args.includeActivityDetails, false)) data.activityItems = year.accountingActivityItems.slice(0, MAX_TOOL_ROWS);
  return result(data, 1, [{ label: "Indicateurs du dashboard", count: 1, freshness: dashboard.syncState.lastSyncAt }], { fiscalYearOffset: offset }, year.vatFiscalSummary.fiscalYear.startDateStr, year.vatFiscalSummary.fiscalYear.endDateStr, 0);
}

function searchTransactions(args: Record<string, unknown>): ToolResult {
  const { dateFrom, dateTo } = dates(args);
  const side = enumValue(args.side, ["credit", "debit", "all"], "all");
  const query = text(args.query); const category = text(args.category);
  const min = optionalNumber(args.minAmountCents); const max = optionalNumber(args.maxAmountCents);
  const hasVat = optionalBoolean(args.hasVat); const { limit, offset } = pagination(args);
  let rows = db.select({ id: transactions.id, label: transactions.label, amount: transactions.amount, amountCents: transactions.amountCents, settledAt: transactions.settledAt, side: transactions.side, operationType: transactions.operationType, category: transactions.category, vatAmount: transactions.vatAmount }).from(transactions).all().filter((row) => inPeriod(row.settledAt, dateFrom, dateTo) && (side === "all" || row.side === side) && includes(row.label, query) && includes(row.category, category) && (min === null || Math.abs(row.amountCents) >= min) && (max === null || Math.abs(row.amountCents) <= max) && (hasVat === null || ((row.vatAmount ?? 0) !== 0) === hasVat));
  rows = sortRows(rows, args.sort, (row) => row.settledAt, (row) => Math.abs(row.amountCents));
  return paged(rows, limit, offset, "Transactions", freshness(), { ...args, limit, offset }, dateFrom, dateTo);
}

function searchInvoices(kind: "customer" | "supplier", args: Record<string, unknown>): ToolResult {
  const { dateFrom, dateTo } = dates(args); const dateField = enumValue(args.dateField, ["issue", "due"], "issue");
  const status = text(args.status); const party = text(args[kind === "customer" ? "clientName" : "supplierName"]); const number = text(args.invoiceNumber);
  const min = optionalNumber(args.minAmountCents); const max = optionalNumber(args.maxAmountCents); const overdueOnly = boolean(args.overdueOnly, false); const today = localIsoDate(); const { limit, offset } = pagination(args);
  const base = kind === "customer"
    ? db.select({ id: customerInvoices.id, invoiceNumber: customerInvoices.invoiceNumber, partyName: customerInvoices.clientName, status: customerInvoices.status, issueDate: customerInvoices.issueDate, dueDate: customerInvoices.dueDate, paidAt: customerInvoices.paidAt, totalAmountHt: customerInvoices.totalAmountHt, totalVatAmount: customerInvoices.totalVatAmount, totalAmountTtc: customerInvoices.totalAmountTtc }).from(customerInvoices).all()
    : db.select({ id: supplierInvoices.id, invoiceNumber: supplierInvoices.invoiceNumber, partyName: supplierInvoices.supplierName, status: supplierInvoices.status, issueDate: supplierInvoices.issueDate, dueDate: supplierInvoices.dueDate, paidAt: supplierInvoices.paidAt, totalAmountHt: supplierInvoices.totalAmountHt, totalVatAmount: supplierInvoices.totalVatAmount, totalAmountTtc: supplierInvoices.totalAmountTtc }).from(supplierInvoices).all();
  let rows = base.filter((row) => { const effectiveDate = dateField === "due" ? row.dueDate : row.issueDate; const cents = Math.round(row.totalAmountTtc * 100); return Boolean(effectiveDate && inPeriod(effectiveDate, dateFrom, dateTo)) && includes(row.status, status) && includes(row.partyName, party) && includes(row.invoiceNumber ?? "", number) && (min === null || cents >= min) && (max === null || cents <= max) && (!overdueOnly || Boolean(row.dueDate && row.dueDate < today && !["paid", "canceled", "cancelled"].includes(row.status.toLowerCase()))); });
  rows = sortRows(rows, args.sort, (row) => (dateField === "due" ? row.dueDate ?? "" : row.issueDate), (row) => row.totalAmountTtc);
  return paged(rows, limit, offset, kind === "customer" ? "Factures clients" : "Factures fournisseurs", freshness(), { ...args, dateField, limit, offset }, dateFrom, dateTo);
}

function searchExpenses(args: Record<string, unknown>): ToolResult {
  const { dateFrom, dateTo } = dates(args); const type = enumValue(args.type, ["ndf", "ik", "all"], "all"); const collaborator = text(args.collaborator); const status = text(args.accountingStatus); const query = text(args.query); const min = optionalNumber(args.minAmountCents); const max = optionalNumber(args.maxAmountCents); const { limit, offset } = pagination(args);
  const names = new Map(db.select().from(collaborators).all().map((row) => [row.id, row.name]));
  const rows = db.select({ id: expenseItems.id, collaboratorId: expenseItems.collaboratorId, type: expenseItems.type, date: expenseItems.date, label: expenseItems.label, amountTtc: expenseItems.amountTtc, amountHt: expenseItems.amountHt, vatRate: expenseItems.vatRate, vatDeductible: expenseItems.vatDeductible, reimbursableAmount: expenseItems.reimbursableAmount, accountingStatus: expenseItems.accountingStatus, distanceKm: expenseItems.distanceKm }).from(expenseItems).all().map((row) => ({ ...row, collaboratorName: names.get(row.collaboratorId) ?? "Inconnu" })).filter((row) => { const cents = Math.round(row.reimbursableAmount * 100); return inPeriod(row.date, dateFrom, dateTo) && (type === "all" || row.type === type) && includes(row.collaboratorName, collaborator) && includes(row.accountingStatus, status) && includes(row.label, query) && (min === null || cents >= min) && (max === null || cents <= max); }).sort((a, b) => b.date.localeCompare(a.date));
  return paged(rows, limit, offset, "Notes de frais et IK", freshness(), { ...args, limit, offset }, dateFrom, dateTo);
}

function reimbursementSummary(args: Record<string, unknown>): ToolResult {
  const collaboratorFilter = text(args.collaborator); const asOf = isoDate(args.asOfDate, "asOfDate") ?? localIsoDate(); const includeReimbursements = boolean(args.includeReimbursements, false);
  const people = db.select().from(collaborators).all().filter((person) => includes(person.name, collaboratorFilter)); const expenses = db.select().from(expenseItems).all(); const reimbursements = db.select().from(expenseReimbursements).all();
  const rows = people.map((person) => { const personExpenses = expenses.filter((item) => item.collaboratorId === person.id && item.date <= asOf && item.accountingStatus !== "canceled"); const personReimbursements = reimbursements.filter((item) => item.collaboratorId === person.id && item.date <= asOf && item.status === "settled"); const due = round(personExpenses.reduce((sum, item) => sum + item.reimbursableAmount, 0)); const reimbursed = round(personReimbursements.reduce((sum, item) => sum + item.amount, 0)); return { collaboratorId: person.id, collaboratorName: person.name, totalDueEur: due, totalReimbursedEur: reimbursed, remainingEur: round(due - reimbursed), ...(includeReimbursements ? { reimbursements: personReimbursements.map(({ id, amount, date, note, status }) => ({ id, amount, date, note, status })) } : {}) }; });
  return result(rows, rows.length, [{ label: "Notes de frais", count: expenses.length }, { label: "Remboursements", count: reimbursements.length }], { collaborator: collaboratorFilter || null, asOfDate: asOf }, null, asOf, 0);
}

function searchAssets(args: Record<string, unknown>): ToolResult {
  const { dateFrom, dateTo } = dates(args); const status = text(args.status); const category = text(args.category); const supplier = text(args.supplier); const query = text(args.query); const below = boolean(args.belowThresholdOnly, false); const threshold = db.select().from(appSettings).all()[0]?.fixedAssetThresholdCents ?? 50000; const { limit, offset } = pagination(args);
  const rows = db.select({ id: fixedAssets.id, assetNumber: fixedAssets.assetNumber, label: fixedAssets.label, description: fixedAssets.description, category: fixedAssets.category, supplierName: fixedAssets.supplierName, purchaseDate: fixedAssets.purchaseDate, serviceDate: fixedAssets.serviceDate, invoiceNumber: fixedAssets.invoiceNumber, sourceType: fixedAssets.sourceType, amountHtCents: fixedAssets.amountHtCents, vatAmountCents: fixedAssets.vatAmountCents, amountTtcCents: fixedAssets.amountTtcCents, acquisitionCostCents: fixedAssets.acquisitionCostCents, depreciableBaseCents: fixedAssets.depreciableBaseCents, residualValueCents: fixedAssets.residualValueCents, depreciationMethod: fixedAssets.depreciationMethod, depreciationDurationMonths: fixedAssets.depreciationDurationMonths, assetAccount: fixedAssets.assetAccount, depreciationAccount: fixedAssets.depreciationAccount, expenseAccount: fixedAssets.expenseAccount, status: fixedAssets.status }).from(fixedAssets).all().filter((row) => inPeriod(row.purchaseDate, dateFrom, dateTo) && includes(row.status, status) && includes(row.category, category) && includes(row.supplierName, supplier) && includes(`${row.assetNumber} ${row.label} ${row.description ?? ""}`, query) && (!below || row.acquisitionCostCents < threshold)).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  return paged(rows, limit, offset, "Immobilisations", freshness(), { ...args, thresholdCents: threshold, limit, offset }, dateFrom, dateTo);
}

function assetSchedule(args: Record<string, unknown>): ToolResult {
  const assetId = requiredText(args.assetId, "assetId"); const asset = db.select().from(fixedAssets).all().find((item) => item.id === assetId || item.assetNumber === assetId); if (!asset) throw new Error("Immobilisation introuvable.");
  const disposal = db.select().from(fixedAssetDisposals).all().find((item) => item.fixedAssetId === asset.id); let rows = buildMonthlyDepreciationSchedule(asset, disposal); const fiscalOffset = boundedInteger(args.fiscalYearOffset, 0, -20, 20, "fiscalYearOffset"); const settings = db.select().from(appSettings).all()[0]; const bounds = getFiscalYearBounds(new Date(), settings?.fiscalYearEndDay ?? 31, settings?.fiscalYearEndMonth ?? 12, fiscalOffset); rows = rows.filter((row) => row.endDate >= bounds.startDateStr && row.startDate <= bounds.endDateStr);
  let data: unknown = rows; if (enumValue(args.granularity, ["monthly", "annual"], "monthly") === "annual") data = [{ period: `${bounds.startDateStr} – ${bounds.endDateStr}`, depreciationCents: rows.reduce((sum, row) => sum + row.depreciationCents, 0), accumulatedDepreciationCents: rows.at(-1)?.accumulatedDepreciationCents ?? asset.openingAccumulatedDepreciationCents, netBookValueCents: rows.at(-1)?.netBookValueCents ?? asset.acquisitionCostCents }];
  return result({ asset: { id: asset.id, assetNumber: asset.assetNumber, label: asset.label, acquisitionCostCents: asset.acquisitionCostCents, depreciableBaseCents: asset.depreciableBaseCents, method: asset.depreciationMethod, durationMonths: asset.depreciationDurationMonths }, schedule: data, disposal }, rows.length, [{ label: `Plan d’amortissement ${asset.assetNumber}`, count: rows.length }], { fiscalYearOffset: fiscalOffset }, bounds.startDateStr, bounds.endDateStr, 0);
}

function searchFlows(args: Record<string, unknown>): ToolResult {
  const { dateFrom, dateTo } = dates(args); const side = enumValue(args.side, ["inflow", "outflow", "all"], "all"); const origin = enumValue(args.origin, ["manual", "automatic", "all"], "all"); const recurrence = enumValue(args.recurrence, ["none", "monthly", "quarterly", "yearly", "all"], "all"); const category = text(args.category); const enabled = optionalBoolean(args.enabled); const { limit, offset } = pagination(args);
  const rows = db.select({ id: futureFlows.id, label: futureFlows.label, type: futureFlows.type, category: futureFlows.category, amountHt: futureFlows.amountHt, vatRate: futureFlows.vatRate, date: futureFlows.date, recurrence: futureFlows.recurrence, origin: futureFlows.origin, enabled: futureFlows.enabled, detectionKey: futureFlows.detectionKey, sourceTransactionIds: futureFlows.sourceTransactionIds }).from(futureFlows).all().filter((row) => inPeriod(row.date, dateFrom, dateTo) && (side === "all" || row.type === side) && (origin === "all" || row.origin === origin) && (recurrence === "all" || row.recurrence === recurrence) && includes(row.category, category) && (enabled === null || row.enabled === enabled)).map((row) => ({ ...row, vatAmount: round(row.amountHt * row.vatRate / 100), amountTtc: round(row.amountHt * (1 + row.vatRate / 100)), sourceTransactionCount: parseIdCount(row.sourceTransactionIds), sourceTransactionIds: undefined })).sort((a, b) => a.date.localeCompare(b.date));
  return paged(rows, limit, offset, "Flux futurs", freshness(), { ...args, limit, offset }, dateFrom, dateTo);
}

function cashProjection(args: Record<string, unknown>): ToolResult {
  const horizonDays = boundedInteger(args.horizonDays, 60, 1, 365, "horizonDays"); const stepDays = boundedInteger(args.granularityDays, horizonDays > 90 ? 7 : 1, 1, 31, "granularityDays"); const includeOperations = boolean(args.includeOperations, false); const account = db.select().from(accounts).all()[0]; const tx = db.select().from(transactions).all(); const customers = db.select().from(customerInvoices).all(); const suppliers = db.select().from(supplierInvoices).all(); const flows = db.select().from(futureFlows).all().filter((flow) => flow.enabled); const today = localIsoDate(); const horizon = new Date(`${today}T12:00:00Z`); horizon.setUTCDate(horizon.getUTCDate() + horizonDays); const events = buildFutureEvents(expandFutureFlows(flows, horizon), customers, suppliers, today); let points = generateChartSeries({ now: new Date(`${today}T12:00:00Z`), todayStr: today, currentCash: account?.balance ?? 0, transactions: tx, futureEvents: events, pastDays: 0, daysAhead: horizonDays, stepDays }); if (!includeOperations) points = points.map((point) => ({ date: point.date, label: point.label, actualBalance: point.actualBalance, projectedBalance: point.projectedBalance, inflow: point.inflow, outflow: point.outflow, isToday: point.isToday }));
  return result(points, points.length, [{ label: "Projection de trésorerie", count: points.length, freshness: freshness() }, { label: "Flux futurs et factures ouvertes", count: events.length }], { horizonDays, granularityDays: stepDays, includeOperations }, today, horizon.toISOString().slice(0, 10), 0);
}

function result(data: unknown, total: number, sources: ToolSource[], filters: Record<string, unknown>, dateFrom: string | null, dateTo: string | null, offset: number): ToolResult { const returned = Array.isArray(data) ? data.length : 1; return { period: { dateFrom, dateTo }, filters, total, returned, offset, freshness: freshness(), sources, data }; }
function paged<T>(rows: T[], limit: number, offset: number, label: string, fresh: string | null, filters: Record<string, unknown>, dateFrom: string | null, dateTo: string | null): ToolResult { const data = rows.slice(offset, offset + limit); return { period: { dateFrom, dateTo }, filters, total: rows.length, returned: data.length, offset, freshness: fresh, sources: [{ label, count: data.length, dateFrom: effectiveMin(data, "date", dateFrom), dateTo: effectiveMax(data, "date", dateTo), freshness: fresh }], data }; }
function freshness(): string | null { return db.select().from(syncStates).all()[0]?.lastSyncAt ?? null; }
function dates(args: Record<string, unknown>) { const dateFrom = isoDate(args.dateFrom, "dateFrom"); const dateTo = isoDate(args.dateTo, "dateTo"); if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("dateFrom doit précéder dateTo."); return { dateFrom, dateTo }; }
function isoDate(value: unknown, name: string): string | null { if (value === undefined || value === null || value === "") return null; if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`${name} doit être au format YYYY-MM-DD.`); return value; }
function pagination(args: Record<string, unknown>) { return { limit: boundedInteger(args.limit, DEFAULT_TOOL_ROWS, 1, MAX_TOOL_ROWS, "limit"), offset: boundedInteger(args.offset, 0, 0, 10000, "offset") }; }
function boundedInteger(value: unknown, fallback: number, min: number, max: number, name: string): number { if (value === undefined) return fallback; if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${name} doit être un entier entre ${min} et ${max}.`); return value; }
function optionalNumber(value: unknown): number | null { if (value === undefined) return null; if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Montant invalide."); return value; }
function objectArgs(value: unknown): Record<string, unknown> { if (value === undefined || value === null) return {}; if (typeof value !== "object" || Array.isArray(value)) throw new Error("Arguments d’outil invalides."); return value as Record<string, unknown>; }
function text(value: unknown): string { if (value === undefined || value === null) return ""; if (typeof value !== "string" || value.length > 200) throw new Error("Filtre texte invalide."); return value.trim(); }
function requiredText(value: unknown, name: string): string { const parsed = text(value); if (!parsed) throw new Error(`${name} est obligatoire.`); return parsed; }
function boolean(value: unknown, fallback: boolean): boolean { if (value === undefined) return fallback; if (typeof value !== "boolean") throw new Error("Booléen invalide."); return value; }
function optionalBoolean(value: unknown): boolean | null { return value === undefined ? null : boolean(value, false); }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T { if (value === undefined) return fallback; if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error("Valeur de filtre invalide."); return value as T; }
function includes(value: string, query: string): boolean { return !query || value.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")); }
function inPeriod(value: string, from: string | null, to: string | null): boolean { const day = value.slice(0, 10); return (!from || day >= from) && (!to || day <= to); }
function sortRows<T>(rows: T[], sort: unknown, date: (row: T) => string, amount: (row: T) => number): T[] { const mode = enumValue(sort, ["date_desc", "date_asc", "amount_desc"], "date_desc"); return rows.sort((a, b) => mode === "date_asc" ? date(a).localeCompare(date(b)) : mode === "amount_desc" ? amount(b) - amount(a) : date(b).localeCompare(date(a))); }
function localIsoDate(): string { return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function parseIdCount(value: string | null): number { if (!value) return 0; try { const ids = JSON.parse(value); return Array.isArray(ids) ? ids.length : 0; } catch { return 0; } }
function effectiveMin<T>(rows: T[], key: string, fallback: string | null): string | undefined { const dates = rows.map((row) => { const record = row as Record<string, unknown>; return String(record[key] ?? record.settledAt ?? record.issueDate ?? "").slice(0, 10); }).filter(Boolean).sort(); return dates[0] ?? fallback ?? undefined; }
function effectiveMax<T>(rows: T[], key: string, fallback: string | null): string | undefined { const dates = rows.map((row) => { const record = row as Record<string, unknown>; return String(record[key] ?? record.settledAt ?? record.issueDate ?? "").slice(0, 10); }).filter(Boolean).sort(); return dates.at(-1) ?? fallback ?? undefined; }
function freshnessWarnings(lastSyncAt: string | null, status: string, transactionCount: number): string[] { const warnings: string[] = []; if (!lastSyncAt) warnings.push("Données Qonto jamais synchronisées."); else if (Date.now() - new Date(lastSyncAt).getTime() > 48 * 60 * 60 * 1000) warnings.push("Dernière synchronisation Qonto antérieure à 48 heures."); if (status === "error") warnings.push("La dernière synchronisation Qonto est en erreur."); if (transactionCount === 0) warnings.push("Aucune transaction disponible."); return warnings; }
