import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Account - Qonto Bank Account details and current balance
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // Qonto slug or account id
  name: text("name").notNull(),
  currency: text("currency").notNull().default("EUR"),
  balance: real("balance").notNull().default(0), // Balance in Euros
  balanceCents: integer("balance_cents").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Transaction - Bank transactions synchronized from Qonto
 */
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(), // Qonto transaction id
  label: text("label").notNull(),
  amount: real("amount").notNull(), // signed: >0 for incoming, <0 for outgoing
  amountCents: integer("amount_cents").notNull(),
  settledBalance: real("settled_balance"), // actual bank balance after transaction from Qonto
  settledAt: text("settled_at").notNull(), // ISO Date string
  side: text("side").notNull(), // "credit" (inflow) or "debit" (outflow)
  operationType: text("operation_type"),
  category: text("category").notNull().default("Autre"),
  vatAmount: real("vat_amount").default(0),
  rawJson: text("raw_json"),
});

/**
 * CustomerInvoice - Client invoices from Qonto (income tracking & vat to collect)
 */
export const customerInvoices = sqliteTable("customer_invoices", {
  id: text("id").primaryKey(), // Qonto invoice id
  invoiceNumber: text("invoice_number").notNull(),
  clientName: text("client_name").notNull(),
  status: text("status").notNull(), // "paid", "unpaid", "pending", "overdue", "canceled"
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date"),
  paidAt: text("paid_at"),
  totalAmountHt: real("total_amount_ht").notNull(),
  totalVatAmount: real("total_vat_amount").notNull(),
  totalAmountTtc: real("total_amount_ttc").notNull(),
  rawJson: text("raw_json"),
});

/**
 * SupplierInvoice - Supplier invoices from Qonto (expense tracking & deductible vat)
 */
export const supplierInvoices = sqliteTable("supplier_invoices", {
  id: text("id").primaryKey(), // Qonto invoice id
  invoiceNumber: text("invoice_number"),
  supplierName: text("supplier_name").notNull(),
  status: text("status").notNull(), // "paid", "unpaid", "pending", "overdue"
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date"),
  paidAt: text("paid_at"),
  totalAmountHt: real("total_amount_ht").notNull(),
  totalVatAmount: real("total_vat_amount").notNull(),
  totalAmountTtc: real("total_amount_ttc").notNull(),
  rawJson: text("raw_json"),
});

/**
 * FutureFlow - Projected flows, added manually or detected from transactions.
 */
export const futureFlows = sqliteTable("future_flows", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  type: text("type").notNull(), // "inflow" | "outflow" (Entrée / Sortie)
  category: text("category").notNull(),
  amountHt: real("amount_ht").notNull(),
  vatRate: real("vat_rate").notNull().default(20), // e.g. 0, 5.5, 10, 20
  date: text("date").notNull(), // YYYY-MM-DD
  recurrence: text("recurrence").notNull().default("none"), // "none" | "monthly" | "quarterly" | "yearly"
  origin: text("origin").notNull().default("manual"), // "manual" | "automatic"
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  detectionKey: text("detection_key"), // Stable identity for an automatically detected recurrence
  sourceTransactionIds: text("source_transaction_ids"), // JSON array of transactions supporting detection
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * SyncState - Global metadata tracking sync status
 */
export const syncStates = sqliteTable("sync_states", {
  id: text("id").primaryKey().default("default"),
  lastSyncAt: text("last_sync_at"),
  status: text("status").default("idle"), // "idle" | "in_progress" | "success" | "error"
  errorMessage: text("error_message"),
});

/**
 * AppSettings - Fiscal parameters and company settings
 */
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  fiscalYearEndDay: integer("fiscal_year_end_day").notNull().default(31),
  fiscalYearEndMonth: integer("fiscal_year_end_month").notNull().default(12),
  vatRegime: text("vat_regime").notNull().default("normal_monthly"), // "normal_monthly" | "normal_quarterly" | "simplified"
  vatPaymentMethod: text("vat_payment_method").notNull().default("debits"), // "debits" | "encaissements"
  updatedAt: text("updated_at").notNull(),
});

/**
 * Collaborator - Employees/Directors claiming expense reports or mileage allowances
 */
export const collaborators = sqliteTable("collaborators", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  mileageRate: real("mileage_rate").notNull().default(0.603), // € / km
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

/**
 * ExpenseItem - Expense reports (NDF) and mileage allowances (IK)
 */
export const expenseItems = sqliteTable("expense_items", {
  id: text("id").primaryKey(),
  collaboratorId: text("collaborator_id")
    .notNull()
    .references(() => collaborators.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "ndf" | "ik"
  date: text("date").notNull(), // YYYY-MM-DD
  label: text("label").notNull(),

  // Financial values. amountTtc is the original receipt total while amountHt,
  // vatDeductible and reimbursableAmount contain only the professional portion.
  amountTtc: real("amount_ttc").notNull(),
  amountHt: real("amount_ht").notNull(),
  vatRate: real("vat_rate").notNull().default(0), // e.g. 20, 10, 5.5, 0
  prorataRate: real("prorata_rate").notNull().default(100), // % pro (e.g. 50, 100)

  // Calculated values stored
  vatDeductible: real("vat_deductible").notNull().default(0),
  reimbursableAmount: real("reimbursable_amount").notNull(), // TTC professionnel engagé
  accountingStatus: text("accounting_status").notNull().default("recognized"), // "recognized" | "canceled"
  sourceTransactionId: text("source_transaction_id").references(() => transactions.id, { onDelete: "set null" }),

  // IK specific
  distanceKm: real("distance_km"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * ExpenseReimbursement - Bank transfers or payments sent to reimburse a collaborator
 */
export const expenseReimbursements = sqliteTable("expense_reimbursements", {
  id: text("id").primaryKey(),
  collaboratorId: text("collaborator_id")
    .notNull()
    .references(() => collaborators.id, { onDelete: "cascade" }),
  transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  amount: real("amount").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  note: text("note"),
  status: text("status").notNull().default("settled"), // settlement of collaborator liability
  createdAt: text("created_at").notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type CustomerInvoice = typeof customerInvoices.$inferSelect;
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type FutureFlow = typeof futureFlows.$inferSelect;
export type NewFutureFlow = typeof futureFlows.$inferInsert;
export type SyncState = typeof syncStates.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type Collaborator = typeof collaborators.$inferSelect;
export type NewCollaborator = typeof collaborators.$inferInsert;
export type ExpenseItem = typeof expenseItems.$inferSelect;
export type NewExpenseItem = typeof expenseItems.$inferInsert;
export type ExpenseReimbursement = typeof expenseReimbursements.$inferSelect;
export type NewExpenseReimbursement = typeof expenseReimbursements.$inferInsert;
