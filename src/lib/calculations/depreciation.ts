import type { FixedAsset, FixedAssetDisposal } from "@/db/schema";
import type { AccountingPeriod } from "./accounting";

export interface DepreciationAmountsInput {
  amountHtCents: number;
  vatAmountCents: number;
  vatDeductibleRate: number;
  incidentalCostsCents?: number;
  residualValueCents?: number;
}

export interface DepreciationAmounts {
  deductibleVatCents: number;
  nonDeductibleVatCents: number;
  acquisitionCostCents: number;
  depreciableBaseCents: number;
}

export interface DepreciationScheduleItem {
  period: string;
  startDate: string;
  endDate: string;
  depreciationCents: number;
  accumulatedDepreciationCents: number;
  netBookValueCents: number;
}

export interface FiscalDepreciationSummary {
  openingNetBookValueCents: number;
  depreciationCents: number;
  accumulatedDepreciationCents: number;
  closingNetBookValueCents: number;
}

const DAY_MS = 86_400_000;

export function calculateDepreciationAmounts(input: DepreciationAmountsInput): DepreciationAmounts {
  const amountHtCents = integerAtLeastZero(input.amountHtCents, "Le montant HT");
  const vatAmountCents = integerAtLeastZero(input.vatAmountCents, "La TVA");
  const incidentalCostsCents = integerAtLeastZero(input.incidentalCostsCents ?? 0, "Les frais accessoires");
  const residualValueCents = integerAtLeastZero(input.residualValueCents ?? 0, "La valeur résiduelle");
  const deductibleRate = finiteInRange(input.vatDeductibleRate, 0, 100, "Le coefficient de déduction de TVA");
  const deductibleVatCents = Math.round(vatAmountCents * deductibleRate / 100);
  const nonDeductibleVatCents = vatAmountCents - deductibleVatCents;
  const acquisitionCostCents = amountHtCents + nonDeductibleVatCents + incidentalCostsCents;
  if (residualValueCents > acquisitionCostCents) {
    throw new Error("La valeur résiduelle ne peut pas dépasser le coût d'entrée.");
  }
  return {
    deductibleVatCents,
    nonDeductibleVatCents,
    acquisitionCostCents,
    depreciableBaseCents: acquisitionCostCents - residualValueCents,
  };
}

export function buildMonthlyDepreciationSchedule(
  asset: FixedAsset,
  disposal?: FixedAssetDisposal | null,
): DepreciationScheduleItem[] {
  validateAssetDates(asset, disposal);
  if (asset.depreciableBaseCents <= 0) return [];

  const serviceDate = parseDate(asset.serviceDate);
  const theoreticalEnd = addUtcDays(addUtcMonths(serviceDate, asset.depreciationDurationMonths), -1);
  const disposalEnd = disposal ? parseDate(disposal.disposalDate) : null;
  const effectiveEnd = disposalEnd && disposalEnd < theoreticalEnd ? disposalEnd : theoreticalEnd;
  const openingDate = asset.isOpeningBalance && asset.openingDate ? parseDate(asset.openingDate) : null;
  const scheduleStart = openingDate && openingDate > serviceDate ? openingDate : serviceDate;
  const openingAccumulated = asset.isOpeningBalance
    ? Math.min(asset.openingAccumulatedDepreciationCents, asset.depreciableBaseCents)
    : 0;
  const remainingCents = asset.depreciableBaseCents - openingAccumulated;

  if (scheduleStart > effectiveEnd || remainingCents <= 0) return [];

  const weights = new Map<string, { startDate: Date; endDate: Date; weight: number }>();
  for (let cursor = scheduleStart; cursor <= effectiveEnd; cursor = addUtcDays(cursor, 1)) {
    const period = isoDate(cursor).slice(0, 7);
    const weight = 1 / daysInYear(cursor.getUTCFullYear());
    const current = weights.get(period);
    if (current) {
      current.endDate = cursor;
      current.weight += weight;
    } else {
      weights.set(period, { startDate: cursor, endDate: cursor, weight });
    }
  }

  let theoreticalWeight = 0;
  for (let cursor = scheduleStart; cursor <= theoreticalEnd; cursor = addUtcDays(cursor, 1)) {
    theoreticalWeight += 1 / daysInYear(cursor.getUTCFullYear());
  }
  let allocated = 0;
  let accumulated = openingAccumulated;
  const periods = [...weights.entries()];

  return periods.map(([period, item], index) => {
    const isLast = index === periods.length - 1;
    const reachesTheoreticalEnd = effectiveEnd.getTime() === theoreticalEnd.getTime();
    const depreciationCents = isLast && reachesTheoreticalEnd
      ? remainingCents - allocated
      : Math.min(remainingCents - allocated, Math.round(remainingCents * item.weight / theoreticalWeight));
    allocated += depreciationCents;
    accumulated += depreciationCents;
    return {
      period,
      startDate: isoDate(item.startDate),
      endDate: isoDate(item.endDate),
      depreciationCents,
      accumulatedDepreciationCents: accumulated,
      netBookValueCents: Math.max(asset.residualValueCents, asset.acquisitionCostCents - accumulated),
    };
  });
}

export function summarizeDepreciationForPeriod(
  asset: FixedAsset,
  period: AccountingPeriod,
  disposal?: FixedAssetDisposal | null,
): FiscalDepreciationSummary {
  const schedule = buildMonthlyDepreciationSchedule(asset, disposal);
  const openingAccumulatedAtPeriodStart = asset.isOpeningBalance && asset.openingDate && asset.openingDate <= period.startDate
    ? asset.openingAccumulatedDepreciationCents
    : 0;
  const openingAccumulatedRecognizedInPeriod = asset.isOpeningBalance
    && asset.openingDate
    && asset.openingDate > period.startDate
    && asset.openingDate <= period.endDate
    ? asset.openingAccumulatedDepreciationCents
    : 0;
  const beforeCents = schedule
    .filter((item) => item.endDate < period.startDate)
    .reduce((sum, item) => sum + item.depreciationCents, openingAccumulatedAtPeriodStart);
  const depreciationCents = schedule
    .filter((item) => item.endDate >= period.startDate && item.startDate <= period.endDate)
    .reduce((sum, item) => sum + item.depreciationCents, 0);
  const accumulatedDepreciationCents = Math.min(
    asset.depreciableBaseCents,
    beforeCents + openingAccumulatedRecognizedInPeriod + depreciationCents,
  );
  return {
    openingNetBookValueCents: Math.max(asset.residualValueCents, asset.acquisitionCostCents - beforeCents),
    depreciationCents,
    accumulatedDepreciationCents,
    closingNetBookValueCents: Math.max(
      asset.residualValueCents,
      asset.acquisitionCostCents - accumulatedDepreciationCents,
    ),
  };
}

export function calculateDepreciationForPeriod(
  assets: FixedAsset[],
  disposals: FixedAssetDisposal[],
  period: AccountingPeriod,
): number {
  const disposalByAsset = new Map(disposals.map((item) => [item.fixedAssetId, item]));
  const cents = assets
    .filter((asset) => asset.status !== "draft")
    .reduce((sum, asset) => sum + summarizeDepreciationForPeriod(asset, period, disposalByAsset.get(asset.id)).depreciationCents, 0);
  return cents / 100;
}

export function getTheoreticalAccumulatedCents(asset: FixedAsset, throughDate: string): number {
  const temporaryDisposal: FixedAssetDisposal = {
    id: "preview",
    fixedAssetId: asset.id,
    type: "scrap",
    disposalDate: throughDate,
    saleAmountHtCents: 0,
    saleVatAmountCents: 0,
    saleAmountTtcCents: 0,
    customerInvoiceId: null,
    transactionId: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
  };
  return buildMonthlyDepreciationSchedule({ ...asset, isOpeningBalance: false, openingDate: null, openingAccumulatedDepreciationCents: 0 }, temporaryDisposal)
    .reduce((sum, item) => sum + item.depreciationCents, 0);
}

function validateAssetDates(asset: FixedAsset, disposal?: FixedAssetDisposal | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.purchaseDate) || !/^\d{4}-\d{2}-\d{2}$/.test(asset.serviceDate)) {
    throw new Error("Les dates doivent être au format YYYY-MM-DD.");
  }
  if (asset.serviceDate < asset.purchaseDate) throw new Error("La mise en service doit être postérieure ou égale à l'achat.");
  if (!Number.isInteger(asset.depreciationDurationMonths) || asset.depreciationDurationMonths < 1) {
    throw new Error("La durée d'amortissement doit être d'au moins un mois entier.");
  }
  if (asset.openingDate && asset.openingDate < asset.serviceDate) throw new Error("La date de reprise ne peut pas précéder la mise en service.");
  if (disposal && disposal.disposalDate < asset.serviceDate) throw new Error("La date de sortie ne peut pas précéder la mise en service.");
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Date invalide : ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (isoDate(date) !== value) throw new Error(`Date invalide : ${value}`);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function daysInYear(year: number): number {
  return new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime() === 366 * DAY_MS ? 366 : 365;
}

function integerAtLeastZero(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} doit être un montant positif en centimes.`);
  return value;
}

function finiteInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} doit être compris entre ${min} et ${max}.`);
  return value;
}
