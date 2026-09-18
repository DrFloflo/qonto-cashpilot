import assert from "node:assert/strict";
import test from "node:test";
import type {
  CustomerInvoice,
  ExpenseItem,
  ExpenseReimbursement,
  SupplierInvoice,
  Transaction,
} from "../../db/schema.ts";
import { calculateExpenseAmounts } from "../expense-calculations.ts";
import {
  calculateAccountingActivity,
  getCustomerVatRecognitionDate,
  getStandaloneVatTransactions,
} from "./accounting.ts";
import { calculateMonthlyTransactions } from "./monthly.ts";
import { getBalanceStatus } from "./vat.ts";

const expense = (overrides: Partial<ExpenseItem> = {}): ExpenseItem => ({
  id: "expense-1",
  collaboratorId: "collaborator-1",
  type: "ndf",
  date: "2025-12-15",
  label: "Professional meal",
  amountTtc: 120,
  amountHt: 50,
  vatRate: 20,
  prorataRate: 50,
  vatDeductible: 10,
  reimbursableAmount: 60,
  accountingStatus: "recognized",
  sourceTransactionId: null,
  distanceKm: null,
  createdAt: "2025-12-15T00:00:00.000Z",
  updatedAt: "2025-12-15T00:00:00.000Z",
  ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "transaction-1",
  label: "Refund employee",
  amount: -60,
  amountCents: -6000,
  settledBalance: null,
  settledAt: "2026-01-10T10:00:00.000Z",
  side: "debit",
  operationType: null,
  category: "Fournisseur",
  vatAmount: 10,
  rawJson: null,
  ...overrides,
});

const customerInvoice = (overrides: Partial<CustomerInvoice> = {}): CustomerInvoice => ({
  id: "customer-1",
  invoiceNumber: "C-1",
  clientName: "Client",
  status: "paid",
  issueDate: "2025-12-20",
  dueDate: "2026-01-20",
  paidAt: "2026-01-10T00:00:00.000Z",
  totalAmountHt: 100,
  totalVatAmount: 20,
  totalAmountTtc: 120,
  rawJson: null,
  ...overrides,
});

const supplierInvoice = (overrides: Partial<SupplierInvoice> = {}): SupplierInvoice => ({
  id: "supplier-1",
  invoiceNumber: "S-1",
  supplierName: "Acme Hosting",
  status: "paid",
  issueDate: "2026-01-02",
  dueDate: "2026-01-10",
  paidAt: "2026-01-10T00:00:00.000Z",
  totalAmountHt: 50,
  totalVatAmount: 10,
  totalAmountTtc: 60,
  rawJson: null,
  ...overrides,
});

const reimbursement = (overrides: Partial<ExpenseReimbursement> = {}): ExpenseReimbursement => ({
  id: "reimbursement-1",
  collaboratorId: "collaborator-1",
  transactionId: "transaction-1",
  amount: 60,
  date: "2026-01-10",
  note: null,
  status: "settled",
  createdAt: "2026-01-10T00:00:00.000Z",
  ...overrides,
});

test("December expense and January reimbursement are separated between accounting and cash", () => {
  const december = calculateAccountingActivity(
    { startDate: "2025-12-01", endDate: "2025-12-31" },
    [],
    [],
    [expense()],
  );
  const january = calculateAccountingActivity(
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    [],
    [],
    [expense()],
  );
  const januaryCash = calculateMonthlyTransactions([transaction({ vatAmount: 0 })], new Date("2026-01-15T12:00:00Z"));

  assert.equal(december.expensesHt, 50);
  assert.equal(january.expensesHt, 0);
  assert.equal(januaryCash.outflows, 60);
});

test("professional proration applies coherently to HT and deductible VAT", () => {
  assert.deepEqual(calculateExpenseAmounts({ type: "ndf", amountTtc: 120, vatRate: 20, prorataRate: 50 }), {
    amountTtc: 120,
    amountHt: 50,
    vatRate: 20,
    prorataRate: 50,
    vatDeductible: 10,
    reimbursableAmount: 60,
    distanceKm: null,
  });
});

test("linked reimbursement transaction cannot create a second VAT expense", () => {
  assert.deepEqual(getStandaloneVatTransactions([transaction()], [], [reimbursement()], [expense()]), []);
});

test("customer VAT uses issue date on debit basis and paidAt on collection basis", () => {
  const invoice = customerInvoice();
  assert.equal(getCustomerVatRecognitionDate(invoice, "debits"), "2025-12-20");
  assert.equal(getCustomerVatRecognitionDate(invoice, "encaissements"), "2026-01-10");
  assert.equal(getCustomerVatRecognitionDate(customerInvoice({ paidAt: null }), "encaissements"), null);
});

test("supplier invoice and matching transaction VAT are not counted twice", () => {
  const bankTransaction = transaction({ label: "ACME HOSTING", amount: -60, amountCents: -6000 });
  assert.deepEqual(getStandaloneVatTransactions([bankTransaction], [supplierInvoice()], [], []), []);
});

test("VAT credit above threshold stays carried and only becomes requestable", () => {
  const status = getBalanceStatus(-1000, 760);
  assert.equal(status.status, "credit_eligible");
  assert.equal(status.refundableVat, 1000);
  assert.equal(status.carriedOverVat, 1000);
});

test("bank loan receipt is cash inflow but not accounting revenue", () => {
  const loan = transaction({
    id: "loan",
    label: "Bank loan",
    amount: 10_000,
    amountCents: 1_000_000,
    side: "credit",
    vatAmount: 0,
  });
  const activity = calculateAccountingActivity(
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    [],
    [],
    [],
  );
  const cash = calculateMonthlyTransactions([loan], new Date("2026-01-15T12:00:00Z"));

  assert.equal(activity.revenueHt, 0);
  assert.equal(cash.inflows, 10_000);
});
