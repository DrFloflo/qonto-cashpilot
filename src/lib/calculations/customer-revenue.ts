export interface CustomerRevenueDocumentInput {
  id: string;
  invoiceNumber: string;
  clientName: string | null;
  customerId?: string | null;
  normalizedClientName?: string | null;
  status: string;
  documentType?: string | null;
  issueDate: string;
  paidAt?: string | null;
  totalAmountHt: number;
  totalVatAmount: number;
  totalAmountTtc: number;
}

export interface CustomerMergeRule {
  canonicalCustomerId: string;
  canonicalName: string;
  identityKey: string;
  sourceLabel: string;
}

export interface CustomerRevenueDocument {
  id: string;
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  recognitionDate: string;
  usedIssueDateFallback: boolean;
  status: string;
  documentType: "invoice" | "credit_note";
  amountHtCents: number;
  vatCents: number;
  amountTtcCents: number;
}

export interface CustomerRevenueRow {
  rank: number;
  customerKey: string;
  canonicalCustomerId: string | null;
  customerName: string;
  variants: string[];
  netRevenueCents: number;
  sharePercent: number;
  invoiceCount: number;
  invoiceRevenueCents: number;
  creditNoteCount: number;
  creditNotesCents: number;
  averageBasketCents: number;
  lastPaymentDate: string;
  documents: CustomerRevenueDocument[];
}

export interface CustomerRevenueChartItem {
  customerKey: string;
  name: string;
  valueCents: number;
  sharePercent: number;
  groupedCustomerCount?: number;
}

export interface CustomerRevenueResult {
  year: number;
  periodStart: string;
  periodEnd: string;
  netRevenueCents: number;
  creditNotesCents: number;
  activeCustomerCount: number;
  topOnePercent: number;
  topThreePercent: number;
  rows: CustomerRevenueRow[];
  chart: CustomerRevenueChartItem[];
  negativeCustomers: CustomerRevenueRow[];
  eligibleDocumentCount: number;
}

const UNKNOWN_NAME = "Client non renseigné";

export function normalizeCustomerName(value: string | null | undefined): string {
  const normalized = (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return normalized || "client-non-renseigne";
}

export function getCustomerIdentity(document: CustomerRevenueDocumentInput): { key: string; type: "qonto_id" | "normalized_name" | "unknown"; label: string } {
  const label = document.clientName?.trim() || UNKNOWN_NAME;
  if (document.customerId?.trim()) return { key: `qonto:${document.customerId.trim()}`, type: "qonto_id", label };
  const normalized = document.normalizedClientName?.trim() || normalizeCustomerName(document.clientName);
  if (normalized === "client-non-renseigne") return { key: "unknown", type: "unknown", label: UNKNOWN_NAME };
  return { key: `name:${normalized}`, type: "normalized_name", label };
}

export function getCalendarYearBounds(year: number, now = new Date()): { start: string; end: string } {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error("Année civile invalide.");
  const currentYear = now.getUTCFullYear();
  const start = `${year}-01-01`;
  const end = year === currentYear ? now.toISOString().slice(0, 10) : `${year}-12-31`;
  return { start, end };
}

export function getAvailableCustomerRevenueYears(documents: CustomerRevenueDocumentInput[], now = new Date()): number[] {
  const years = new Set<number>([now.getUTCFullYear()]);
  for (const document of documents) {
    if (document.status.toLowerCase() !== "paid") continue;
    const date = (document.paidAt || document.issueDate).slice(0, 10);
    const year = Number(date.slice(0, 4));
    if (Number.isInteger(year) && year >= 1900 && year <= now.getUTCFullYear()) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function calculateCustomerRevenue(
  documents: CustomerRevenueDocumentInput[],
  year: number,
  mergeRules: CustomerMergeRule[] = [],
  now = new Date(),
): CustomerRevenueResult {
  const bounds = getCalendarYearBounds(year, now);
  const rules = new Map(mergeRules.map((rule) => [rule.identityKey, rule]));
  const groups = new Map<string, { canonicalId: string | null; name: string; variants: Map<string, number>; documents: CustomerRevenueDocument[] }>();

  for (const source of documents) {
    if (source.status.toLowerCase() !== "paid") continue;
    const recognitionDate = (source.paidAt || source.issueDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recognitionDate) || recognitionDate < bounds.start || recognitionDate > bounds.end) continue;

    const identity = getCustomerIdentity(source);
    const rule = rules.get(identity.key);
    const customerKey = rule ? `canonical:${rule.canonicalCustomerId}` : identity.key;
    let group = groups.get(customerKey);
    if (!group) {
      group = { canonicalId: rule?.canonicalCustomerId ?? null, name: rule?.canonicalName ?? identity.label, variants: new Map(), documents: [] };
      groups.set(customerKey, group);
    }
    group.variants.set(identity.label, (group.variants.get(identity.label) ?? 0) + 1);
    if (!rule && identity.label !== UNKNOWN_NAME) {
      const currentFrequency = group.variants.get(group.name) ?? 0;
      if ((group.variants.get(identity.label) ?? 0) >= currentFrequency) group.name = identity.label;
    }

    const isCredit = source.documentType === "credit_note" || source.totalAmountHt < 0;
    const sign = isCredit ? -1 : 1;
    group.documents.push({
      id: source.id,
      invoiceNumber: source.invoiceNumber,
      clientName: identity.label,
      issueDate: source.issueDate.slice(0, 10),
      recognitionDate,
      usedIssueDateFallback: !source.paidAt,
      status: source.status,
      documentType: isCredit ? "credit_note" : "invoice",
      amountHtCents: sign * Math.abs(toCents(source.totalAmountHt)),
      vatCents: sign * Math.abs(toCents(source.totalVatAmount)),
      amountTtcCents: sign * Math.abs(toCents(source.totalAmountTtc)),
    });
  }

  const preliminary = [...groups.entries()].map(([customerKey, group]) => {
    const invoices = group.documents.filter((document) => document.documentType === "invoice");
    const credits = group.documents.filter((document) => document.documentType === "credit_note");
    const invoiceRevenueCents = invoices.reduce((sum, document) => sum + document.amountHtCents, 0);
    const creditNotesCents = credits.reduce((sum, document) => sum + Math.abs(document.amountHtCents), 0);
    return {
      rank: 0,
      customerKey,
      canonicalCustomerId: group.canonicalId,
      customerName: group.name,
      variants: [...group.variants.keys()].sort((a, b) => a.localeCompare(b, "fr")),
      netRevenueCents: invoiceRevenueCents - creditNotesCents,
      sharePercent: 0,
      invoiceCount: invoices.length,
      invoiceRevenueCents,
      creditNoteCount: credits.length,
      creditNotesCents,
      averageBasketCents: invoices.length ? Math.round(invoiceRevenueCents / invoices.length) : 0,
      lastPaymentDate: group.documents.map((document) => document.recognitionDate).sort().at(-1) ?? "",
      documents: group.documents.sort((a, b) => b.recognitionDate.localeCompare(a.recognitionDate) || a.invoiceNumber.localeCompare(b.invoiceNumber)),
    } satisfies CustomerRevenueRow;
  }).sort((a, b) => b.netRevenueCents - a.netRevenueCents || a.customerName.localeCompare(b.customerName, "fr"));

  const netRevenueCents = preliminary.reduce((sum, row) => sum + row.netRevenueCents, 0);
  const rows = preliminary.map((row, index) => ({ ...row, rank: index + 1, sharePercent: netRevenueCents === 0 ? 0 : row.netRevenueCents / netRevenueCents * 100 }));
  const positive = rows.filter((row) => row.netRevenueCents > 0);
  const top: CustomerRevenueChartItem[] = positive.slice(0, 10).map((row) => ({ customerKey: row.customerKey, name: row.customerName, valueCents: row.netRevenueCents, sharePercent: row.sharePercent }));
  const remaining = positive.slice(10);
  if (remaining.length) top.push({ customerKey: "other", name: "Autres clients", valueCents: remaining.reduce((sum, row) => sum + row.netRevenueCents, 0), sharePercent: remaining.reduce((sum, row) => sum + row.sharePercent, 0), groupedCustomerCount: remaining.length });

  return {
    year,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    netRevenueCents,
    creditNotesCents: rows.reduce((sum, row) => sum + row.creditNotesCents, 0),
    activeCustomerCount: rows.filter((row) => row.netRevenueCents !== 0).length,
    topOnePercent: rows[0]?.sharePercent ?? 0,
    topThreePercent: rows.slice(0, 3).reduce((sum, row) => sum + row.sharePercent, 0),
    rows,
    chart: top,
    negativeCustomers: rows.filter((row) => row.netRevenueCents < 0),
    eligibleDocumentCount: rows.reduce((sum, row) => sum + row.documents.length, 0),
  };
}

function toCents(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}
