import type { AppSettings, FutureFlow, Transaction } from "@/db/schema";

export interface VatItem {
  id: string;
  source:
    | "Facture Client (Encaissée)"
    | "Facture Fournisseur (Payée)"
    | "Facture Client (À encaisser)"
    | "Facture Fournisseur (À décaisser)"
    | "Dépense / Transaction"
    | "Note de Frais"
    | "Flux Futur";
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
  openingVatCredit: number;
  rawBalance: number;
  status: "due" | "credit_refundable" | "credit_carried_over";
  statusLabel: string;
  threshold: number;
  vatToProvision: number;
  refundableVat: number;
  carriedOverVat: number;
  revenueReal: number;
  revenueFuture: number;
  totalRevenue: number;
  expensesReal: number;
  expensesFuture: number;
  totalExpenses: number;
  netResult: number;
}

export interface VatYearData {
  offset: number;
  vatFiscalSummary: VatFiscalSummary;
  vatProvisionItems: VatItem[];
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
  date: string;
  label: string;
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

export interface VatDetails {
  collectedReal: number;
  deductibleReal: number;
  futureToCollect: number;
  futureToDeduct: number;
  futureForecastFlowsVat: number;
}

export interface VatCalculationResult {
  summary: VatFiscalSummary;
  items: VatItem[];
  details: VatDetails;
}

export interface ProjectionTimeframes {
  timeframe30d: ChartPoint[];
  timeframe60d: ChartPoint[];
  timeframe90d: ChartPoint[];
  timeframe12m: ChartPoint[];
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
    vatFiscalYears: VatYearData[];
    vatDetails: VatDetails;
    monthRevenueItems: Transaction[];
    monthExpenseItems: Transaction[];
    vatProvisionItems: VatItem[];
  };
  projectionChart: ProjectionTimeframes & {
    past7d?: ProjectionTimeframes;
    past14d?: ProjectionTimeframes;
    past30d?: ProjectionTimeframes;
    past90d?: ProjectionTimeframes;
  };
  futureFlows: FutureFlow[];
}
