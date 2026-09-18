import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import fs from "fs";
import path from "path";

const dbDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlitePath = path.join(dbDir, "previ.db");
const sqlite = new Database(sqlitePath);

sqlite.pragma("journal_mode = WAL");

// Initialize tables automatically
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    balance REAL NOT NULL DEFAULT 0,
    balance_cents INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    amount REAL NOT NULL,
    amount_cents INTEGER NOT NULL,
    settled_balance REAL,
    settled_at TEXT NOT NULL,
    side TEXT NOT NULL,
    operation_type TEXT,
    category TEXT NOT NULL DEFAULT 'Autre',
    vat_amount REAL DEFAULT 0,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS customer_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    paid_at TEXT,
    total_amount_ht REAL NOT NULL,
    total_vat_amount REAL NOT NULL,
    total_amount_ttc REAL NOT NULL,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS supplier_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT,
    supplier_name TEXT NOT NULL,
    status TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    paid_at TEXT,
    total_amount_ht REAL NOT NULL,
    total_vat_amount REAL NOT NULL,
    total_amount_ttc REAL NOT NULL,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS future_flows (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_ht REAL NOT NULL,
    vat_rate REAL NOT NULL DEFAULT 20,
    date TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none',
    origin TEXT NOT NULL DEFAULT 'manual',
    enabled INTEGER NOT NULL DEFAULT 1,
    detection_key TEXT,
    source_transaction_ids TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_states (
    id TEXT PRIMARY KEY DEFAULT 'default',
    last_sync_at TEXT,
    status TEXT DEFAULT 'idle',
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    fiscal_year_end_day INTEGER NOT NULL DEFAULT 31,
    fiscal_year_end_month INTEGER NOT NULL DEFAULT 12,
    vat_regime TEXT NOT NULL DEFAULT 'normal_monthly',
    vat_payment_method TEXT NOT NULL DEFAULT 'debits',
    fixed_asset_threshold_cents INTEGER NOT NULL DEFAULT 50000,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collaborators (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    mileage_rate REAL NOT NULL DEFAULT 0.603,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_items (
    id TEXT PRIMARY KEY,
    collaborator_id TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    label TEXT NOT NULL,
    amount_ttc REAL NOT NULL,
    amount_ht REAL NOT NULL,
    vat_rate REAL NOT NULL DEFAULT 0,
    prorata_rate REAL NOT NULL DEFAULT 100,
    vat_deductible REAL NOT NULL DEFAULT 0,
    reimbursable_amount REAL NOT NULL,
    accounting_status TEXT NOT NULL DEFAULT 'recognized',
    source_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    distance_km REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expense_reimbursements (
    id TEXT PRIMARY KEY,
    collaborator_id TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'settled',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fixed_assets (
    id TEXT PRIMARY KEY,
    asset_number TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    service_date TEXT NOT NULL,
    invoice_number TEXT,
    supplier_invoice_id TEXT REFERENCES supplier_invoices(id) ON DELETE SET NULL,
    document_url TEXT,
    source_type TEXT NOT NULL DEFAULT 'none',
    source_transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
    source_expense_item_id TEXT REFERENCES expense_items(id) ON DELETE RESTRICT,
    amount_ht_cents INTEGER NOT NULL,
    vat_amount_cents INTEGER NOT NULL DEFAULT 0,
    amount_ttc_cents INTEGER NOT NULL,
    vat_rate REAL NOT NULL DEFAULT 20,
    vat_deductible_rate REAL NOT NULL DEFAULT 100,
    incidental_costs_cents INTEGER NOT NULL DEFAULT 0,
    acquisition_cost_cents INTEGER NOT NULL,
    residual_value_cents INTEGER NOT NULL DEFAULT 0,
    depreciable_base_cents INTEGER NOT NULL,
    depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
    depreciation_duration_months INTEGER NOT NULL,
    asset_account TEXT NOT NULL,
    depreciation_account TEXT NOT NULL,
    expense_account TEXT NOT NULL,
    is_opening_balance INTEGER NOT NULL DEFAULT 0,
    opening_date TEXT,
    opening_accumulated_depreciation_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_service',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (source_type IN ('none', 'transaction', 'expense_item')),
    CHECK (
      (source_type = 'none' AND source_transaction_id IS NULL AND source_expense_item_id IS NULL)
      OR (source_type = 'transaction' AND source_transaction_id IS NOT NULL AND source_expense_item_id IS NULL)
      OR (source_type = 'expense_item' AND source_transaction_id IS NULL AND source_expense_item_id IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS fixed_asset_sources (
    id TEXT PRIMARY KEY,
    fixed_asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
    expense_item_id TEXT REFERENCES expense_items(id) ON DELETE RESTRICT,
    supplier_invoice_id TEXT REFERENCES supplier_invoices(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL,
    CHECK (source_type IN ('transaction', 'expense_item', 'supplier_invoice')),
    CHECK (
      (source_type = 'transaction' AND transaction_id IS NOT NULL AND expense_item_id IS NULL AND supplier_invoice_id IS NULL)
      OR (source_type = 'expense_item' AND transaction_id IS NULL AND expense_item_id IS NOT NULL AND supplier_invoice_id IS NULL)
      OR (source_type = 'supplier_invoice' AND transaction_id IS NULL AND expense_item_id IS NULL AND supplier_invoice_id IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS fixed_asset_disposals (
    id TEXT PRIMARY KEY,
    fixed_asset_id TEXT NOT NULL UNIQUE REFERENCES fixed_assets(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    disposal_date TEXT NOT NULL,
    sale_amount_ht_cents INTEGER NOT NULL DEFAULT 0,
    sale_vat_amount_cents INTEGER NOT NULL DEFAULT 0,
    sale_amount_ttc_cents INTEGER NOT NULL DEFAULT 0,
    customer_invoice_id TEXT REFERENCES customer_invoices(id) ON DELETE SET NULL,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (type IN ('sale', 'scrap'))
  );
`);

// Ensure default settings exist
try {
  const existingSettings = sqlite.prepare("SELECT id FROM app_settings WHERE id = 'default'").get();
  if (!existingSettings) {
    sqlite.prepare(`
      INSERT INTO app_settings (id, fiscal_year_end_day, fiscal_year_end_month, vat_regime, vat_payment_method, updated_at)
      VALUES ('default', 31, 12, 'normal_monthly', 'debits', ?)
    `).run(new Date().toISOString());
  }
} catch {
  // ignore
}

try {
  sqlite.exec(`ALTER TABLE transactions ADD COLUMN settled_balance REAL;`);
} catch {
  // column already exists
}

const futureFlowMigrations = [
  `ALTER TABLE future_flows ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';`,
  `ALTER TABLE future_flows ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;`,
  `ALTER TABLE future_flows ADD COLUMN detection_key TEXT;`,
  `ALTER TABLE future_flows ADD COLUMN source_transaction_ids TEXT;`,
];

for (const migration of futureFlowMigrations) {
  try {
    sqlite.exec(migration);
  } catch {
    // column already exists
  }
}

const accountingMigrations = [
  `ALTER TABLE app_settings ADD COLUMN fixed_asset_threshold_cents INTEGER NOT NULL DEFAULT 50000;`,
  `ALTER TABLE expense_items ADD COLUMN accounting_status TEXT NOT NULL DEFAULT 'recognized';`,
  `ALTER TABLE expense_items ADD COLUMN source_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL;`,
  `ALTER TABLE expense_reimbursements ADD COLUMN status TEXT NOT NULL DEFAULT 'settled';`,
];

for (const migration of accountingMigrations) {
  try {
    sqlite.exec(migration);
  } catch {
    // Additive migration already applied. Existing rows remain recognized/settled.
  }
}

sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS future_flows_detection_key_unique
  ON future_flows(detection_key)
  WHERE detection_key IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS expense_reimbursements_transaction_unique
  ON expense_reimbursements(transaction_id)
  WHERE transaction_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS expense_items_source_transaction_unique
  ON expense_items(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_source_transaction_unique
  ON fixed_assets(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_source_expense_unique
  ON fixed_assets(source_expense_item_id)
  WHERE source_expense_item_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS fixed_asset_sources_transaction_unique
  ON fixed_asset_sources(transaction_id)
  WHERE transaction_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS fixed_asset_sources_expense_unique
  ON fixed_asset_sources(expense_item_id)
  WHERE expense_item_id IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS fixed_asset_sources_supplier_invoice_unique
  ON fixed_asset_sources(supplier_invoice_id)
  WHERE supplier_invoice_id IS NOT NULL;
`);

export const db = drizzle(sqlite, { schema });
