/**
 * Shared SQLite connection for the app's local database (herbeco.db).
 *
 * Two tables live here:
 *  - invoices   — every generated bill (Bills tab, dashboard)
 *  - referrals  — referral partners saved in Settings → Referrals
 *
 * Bills are kept until the owner deletes them: there is no retention purge.
 * New columns are added with ALTER TABLE so existing installs keep their data.
 */

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'herbeco.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Adds a column only when it does not exist yet (safe on every launch). */
async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (info.some((c) => c.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function createSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY NOT NULL,
      number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      gst REAL NOT NULL,
      grand_total REAL NOT NULL,
      created_at_ms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      uploaded_at_ms INTEGER,
      referral_code TEXT,
      referral_name TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices (created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS referrals (
      code TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_via TEXT NOT NULL DEFAULT 'cash',
      category TEXT,
      created_at_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses (created_at_ms DESC);
  `);

  // Databases created by an older version of the app gain the new columns here.
  await ensureColumn(db, 'invoices', 'discount', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'invoices', 'referral_code', 'TEXT');
  await ensureColumn(db, 'invoices', 'referral_name', 'TEXT');
  // Per-bill referral commission (10%) the owner has marked as paid.
  await ensureColumn(db, 'invoices', 'commission_paid', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'invoices', 'commission_paid_ms', 'INTEGER');
  // Payment method tracking (cash / bank / split).
  await ensureColumn(db, 'invoices', 'payment_method', 'TEXT');
  await ensureColumn(db, 'invoices', 'bank_amount', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'invoices', 'cash_amount', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'invoices', 'payment_confirmed', 'INTEGER NOT NULL DEFAULT 0');
}

/** Opens (once per session) and migrates the app database. */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await createSchema(db);
      return db;
    })();
  }
  return dbPromise;
}
