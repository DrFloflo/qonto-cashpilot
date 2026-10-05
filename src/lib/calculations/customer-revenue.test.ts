import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCustomerRevenue,
  getAvailableCustomerRevenueYears,
  getCalendarYearBounds,
  normalizeCustomerName,
  type CustomerRevenueDocumentInput,
} from "./customer-revenue";

const now = new Date("2026-09-24T10:00:00Z");
const invoice = (overrides: Partial<CustomerRevenueDocumentInput> = {}): CustomerRevenueDocumentInput => ({
  id: "i-1", invoiceNumber: "F-1", clientName: "Acme", customerId: null, normalizedClientName: null,
  status: "paid", documentType: "invoice", issueDate: "2026-01-10", paidAt: "2026-02-10",
  totalAmountHt: 100, totalVatAmount: 20, totalAmountTtc: 120, ...overrides,
});

test("normalizes whitespace, case and accents", () => {
  assert.equal(normalizeCustomerName("  Société   ÉTÉ "), "societe ete");
  assert.equal(normalizeCustomerName(""), "client-non-renseigne");
});

test("returns exact current and historical calendar-year bounds", () => {
  assert.deepEqual(getCalendarYearBounds(2026, now), { start: "2026-01-01", end: "2026-09-24" });
  assert.deepEqual(getCalendarYearBounds(2025, now), { start: "2025-01-01", end: "2025-12-31" });
});

test("includes only paid documents in range and falls back to issue date", () => {
  const result = calculateCustomerRevenue([
    invoice(),
    invoice({ id: "fallback", invoiceNumber: "F-2", paidAt: null, issueDate: "2026-03-01", totalAmountHt: 50 }),
    invoice({ id: "unpaid", status: "unpaid", totalAmountHt: 900 }),
    invoice({ id: "future", paidAt: "2026-12-01", totalAmountHt: 800 }),
    invoice({ id: "past", paidAt: "2025-12-31", totalAmountHt: 700 }),
  ], 2026, [], now);
  assert.equal(result.netRevenueCents, 15_000);
  assert.equal(result.eligibleDocumentCount, 2);
  assert.equal(result.rows[0].documents.find((item) => item.id === "fallback")?.usedIssueDateFallback, true);
});

test("groups by stable id first and normalized name as fallback", () => {
  const result = calculateCustomerRevenue([
    invoice({ id: "1", clientName: "Été SARL", customerId: "q1" }),
    invoice({ id: "2", clientName: "Nouveau nom", customerId: "q1" }),
    invoice({ id: "3", clientName: "  ACME  ", customerId: null }),
    invoice({ id: "4", clientName: "acme", customerId: null }),
  ], 2026, [], now);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => row.invoiceCount).sort(), [2, 2]);
});

test("applies and effectively cancels persistent merge mappings without changing documents", () => {
  const documents = [invoice({ id: "1", clientName: "Acme", customerId: "a" }), invoice({ id: "2", clientName: "ACME France", customerId: "b" })];
  const merged = calculateCustomerRevenue(documents, 2026, [
    { canonicalCustomerId: "c1", canonicalName: "Acme Groupe", identityKey: "qonto:a", sourceLabel: "Acme" },
    { canonicalCustomerId: "c1", canonicalName: "Acme Groupe", identityKey: "qonto:b", sourceLabel: "ACME France" },
  ], now);
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0].customerName, "Acme Groupe");
  assert.deepEqual(merged.rows[0].variants, ["Acme", "ACME France"].sort((a, b) => a.localeCompare(b, "fr")));
  assert.equal(calculateCustomerRevenue(documents, 2026, [], now).rows.length, 2);
});

test("deducts credit notes, keeps negative customers and computes basket before credits", () => {
  const result = calculateCustomerRevenue([
    invoice({ id: "sale", totalAmountHt: 100 }),
    invoice({ id: "credit", documentType: "credit_note", totalAmountHt: 140, totalVatAmount: 28, totalAmountTtc: 168 }),
    invoice({ id: "other", clientName: "Beta", totalAmountHt: 200 }),
  ], 2026, [], now);
  const acme = result.rows.find((row) => row.customerName === "Acme")!;
  assert.equal(acme.netRevenueCents, -4_000);
  assert.equal(acme.creditNotesCents, 14_000);
  assert.equal(acme.averageBasketCents, 10_000);
  assert.equal(acme.sharePercent, -25);
  assert.equal(result.netRevenueCents, 16_000);
  assert.equal(result.negativeCustomers.length, 1);
  assert.equal(result.chart.some((item) => item.name === "Acme"), false);
});

test("handles zero and negative totals without division by zero", () => {
  const zero = calculateCustomerRevenue([invoice(), invoice({ id: "credit", documentType: "credit_note" })], 2026, [], now);
  assert.equal(zero.netRevenueCents, 0);
  assert.ok(zero.rows.every((row) => row.sharePercent === 0));
  const negative = calculateCustomerRevenue([invoice({ documentType: "credit_note" })], 2026, [], now);
  assert.equal(negative.netRevenueCents, -10_000);
  assert.equal(negative.rows[0].sharePercent, 100);
});

test("uses cents rounding and groups positive clients beyond top ten", () => {
  const documents = Array.from({ length: 12 }, (_, index) => invoice({ id: String(index), clientName: `Client ${index}`, totalAmountHt: 10.005 + index }));
  const result = calculateCustomerRevenue(documents, 2026, [], now);
  assert.equal(result.chart.length, 11);
  assert.equal(result.chart.at(-1)?.name, "Autres clients");
  assert.equal(result.chart.at(-1)?.groupedCustomerCount, 2);
  assert.equal(result.rows.at(-1)?.netRevenueCents, 1001);
});

test("lists available paid years plus current year", () => {
  assert.deepEqual(getAvailableCustomerRevenueYears([
    invoice({ paidAt: "2024-02-01" }), invoice({ id: "2", paidAt: null, issueDate: "2025-01-01" }), invoice({ id: "3", status: "unpaid", issueDate: "2020-01-01" }),
  ], now), [2026, 2025, 2024]);
});
