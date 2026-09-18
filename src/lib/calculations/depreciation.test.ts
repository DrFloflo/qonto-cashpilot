import assert from "node:assert/strict";
import test from "node:test";
import type { FixedAsset, FixedAssetDisposal } from "@/db/schema";
import {
  buildMonthlyDepreciationSchedule,
  calculateDepreciationAmounts,
  summarizeDepreciationForPeriod,
} from "./depreciation";

function asset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: "asset-1",
    assetNumber: "IMMO-0001",
    label: "Ordinateur",
    description: null,
    category: "computer",
    supplierName: "Fournisseur",
    purchaseDate: "2026-01-01",
    serviceDate: "2026-01-01",
    invoiceNumber: null,
    supplierInvoiceId: null,
    documentUrl: null,
    sourceType: "none",
    sourceTransactionId: null,
    sourceExpenseItemId: null,
    amountHtCents: 120000,
    vatAmountCents: 24000,
    amountTtcCents: 144000,
    vatRate: 20,
    vatDeductibleRate: 100,
    incidentalCostsCents: 0,
    acquisitionCostCents: 120000,
    residualValueCents: 0,
    depreciableBaseCents: 120000,
    depreciationMethod: "straight_line",
    depreciationDurationMonths: 12,
    assetAccount: "2183",
    depreciationAccount: "28183",
    expenseAccount: "68112",
    isOpeningBalance: false,
    openingDate: null,
    openingAccumulatedDepreciationCents: 0,
    status: "in_service",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("calculates acquisition cost with partially deductible VAT", () => {
  assert.deepEqual(calculateDepreciationAmounts({
    amountHtCents: 100000,
    vatAmountCents: 20000,
    vatDeductibleRate: 50,
    incidentalCostsCents: 5000,
    residualValueCents: 10000,
  }), {
    deductibleVatCents: 10000,
    nonDeductibleVatCents: 10000,
    acquisitionCostCents: 115000,
    depreciableBaseCents: 105000,
  });
});

test("allocates the full depreciable base to the cent", () => {
  const schedule = buildMonthlyDepreciationSchedule(asset());
  assert.equal(schedule.reduce((sum, item) => sum + item.depreciationCents, 0), 120000);
  assert.equal(schedule.at(-1)?.netBookValueCents, 0);
});

test("preserves residual value", () => {
  const schedule = buildMonthlyDepreciationSchedule(asset({ residualValueCents: 20000, depreciableBaseCents: 100000 }));
  assert.equal(schedule.reduce((sum, item) => sum + item.depreciationCents, 0), 100000);
  assert.equal(schedule.at(-1)?.netBookValueCents, 20000);
});

test("stops depreciation on an early disposal without accelerating the remainder", () => {
  const disposal: FixedAssetDisposal = {
    id: "disposal-1",
    fixedAssetId: "asset-1",
    type: "sale",
    disposalDate: "2026-06-30",
    saleAmountHtCents: 50000,
    saleVatAmountCents: 10000,
    saleAmountTtcCents: 60000,
    customerInvoiceId: null,
    transactionId: null,
    notes: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
  const schedule = buildMonthlyDepreciationSchedule(asset(), disposal);
  const total = schedule.reduce((sum, item) => sum + item.depreciationCents, 0);
  assert.equal(schedule.at(-1)?.endDate, "2026-06-30");
  assert.ok(total > 59000 && total < 61000);
});

test("uses opening accumulated depreciation and remaining duration", () => {
  const openingAsset = asset({
    isOpeningBalance: true,
    openingDate: "2026-07-01",
    openingAccumulatedDepreciationCents: 60000,
  });
  const schedule = buildMonthlyDepreciationSchedule(openingAsset);
  assert.equal(schedule.reduce((sum, item) => sum + item.depreciationCents, 0), 60000);
  assert.equal(schedule.at(-1)?.accumulatedDepreciationCents, 120000);
});

test("summarizes a fiscal period", () => {
  const summary = summarizeDepreciationForPeriod(asset(), { startDate: "2026-04-01", endDate: "2027-03-31" });
  assert.ok(summary.openingNetBookValueCents < 120000);
  assert.equal(summary.closingNetBookValueCents, 0);
  assert.equal(summary.accumulatedDepreciationCents, 120000);
});

test("includes an opening-balance takeover occurring during the fiscal period", () => {
  const openingAsset = asset({
    isOpeningBalance: true,
    openingDate: "2026-07-01",
    openingAccumulatedDepreciationCents: 60000,
  });
  const summary = summarizeDepreciationForPeriod(openingAsset, {
    startDate: "2026-04-01",
    endDate: "2026-12-31",
  });

  assert.equal(summary.openingNetBookValueCents, 120000);
  assert.equal(
    summary.accumulatedDepreciationCents,
    openingAsset.openingAccumulatedDepreciationCents + summary.depreciationCents,
  );
  assert.equal(
    summary.closingNetBookValueCents,
    openingAsset.acquisitionCostCents - summary.accumulatedDepreciationCents,
  );
});

test("includes an opening-balance takeover dated on the first day of the fiscal period", () => {
  const openingAsset = asset({
    isOpeningBalance: true,
    openingDate: "2026-04-01",
    openingAccumulatedDepreciationCents: 30000,
  });
  const summary = summarizeDepreciationForPeriod(openingAsset, {
    startDate: "2026-04-01",
    endDate: "2026-09-30",
  });

  assert.equal(summary.openingNetBookValueCents, 90000);
  assert.equal(
    summary.accumulatedDepreciationCents,
    openingAsset.openingAccumulatedDepreciationCents + summary.depreciationCents,
  );
});
