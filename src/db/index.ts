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
    created_at TEXT NOT NULL
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

export const db = drizzle(sqlite, { schema });
