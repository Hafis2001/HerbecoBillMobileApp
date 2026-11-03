/**
 * Local SQLite storage for generated bills (Bills tab).
 *
 * Every generated invoice is persisted with a "pending" status. The owner can
 * tap "Uploaded" once the bill has been uploaded manually (e.g. to GST
 * portal); records older than 30 days are deleted automatically.
 */

import * as SQLite from 'expo-sqlite';
import type { Invoice, InvoiceRecord, InvoiceStatus } from '../types';

const DB_NAME = 'herbeco.db';
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS invoices (
          id TEXT PRIMARY KEY NOT NULL,
          number TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          items_json TEXT NOT NULL,
          subtotal REAL NOT NULL,
          gst REAL NOT NULL,
          grand_total REAL NOT NULL,
          created_at_ms INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          uploaded_at_ms INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices (created_at_ms DESC);
      `);
      return db;
    })();
  }
  return dbPromise;
}

/** Raw SQLite row shape for the invoices table. */
interface InvoiceRow {
  id: string;
  number: string;
  type: string;
  customer_name: string;
  customer_phone: string;
  items_json: string;
  subtotal: number;
  gst: number;
  grand_total: number;
  created_at_ms: number;
  status: string;
  uploaded_at_ms: number | null;
}

const rowToRecord = (row: InvoiceRow): InvoiceRecord => ({
  id: row.id,
  number: row.number,
  type: row.type === 'referral' ? 'referral' : 'home',
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  items: JSON.parse(row.items_json),
  subtotal: row.subtotal,
  gst: row.gst,
  grandTotal: row.grand_total,
  createdAtMs: row.created_at_ms,
  status: row.status === 'uploaded' ? 'uploaded' : 'pending',
  uploadedAtMs: row.uploaded_at_ms,
});

/** Persists a generated invoice (upsert by number, so re-generating is safe). */
export async function saveInvoice(invoice: Invoice): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO invoices
       (id, number, type, customer_name, customer_phone, items_json,
        subtotal, gst, grand_total, created_at_ms, status, uploaded_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL)
     ON CONFLICT(number) DO UPDATE SET
       customer_name = excluded.customer_name,
       customer_phone = excluded.customer_phone,
       items_json = excluded.items_json,
       subtotal = excluded.subtotal,
       gst = excluded.gst,
       grand_total = excluded.grand_total`,
    invoice.number,
    invoice.number,
    invoice.type,
    invoice.customer.name,
    invoice.customer.phone,
    JSON.stringify(invoice.items),
    invoice.subtotal,
    invoice.gst,
    invoice.grandTotal,
    new Date(invoice.createdAt).getTime(),
  );
}

/** All saved bills, newest first. */
export async function getInvoiceRecords(): Promise<InvoiceRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<InvoiceRow>(
    'SELECT * FROM invoices ORDER BY created_at_ms DESC, number DESC',
  );
  return rows.map(rowToRecord);
}

/** Marks a bill as uploaded (or back to pending with status toggle). */
export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE invoices SET status = ?, uploaded_at_ms = ? WHERE id = ?',
    status,
    status === 'uploaded' ? Date.now() : null,
    id,
  );
}

export async function deleteInvoice(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM invoices WHERE id = ?', id);
}

/** Deletes bills older than 30 days. Returns how many were removed. */
export async function purgeExpiredInvoices(retentionDays = RETENTION_DAYS): Promise<number> {
  const db = await getDb();
  const cutoff = Date.now() - retentionDays * DAY_MS;
  const result = await db.runAsync('DELETE FROM invoices WHERE created_at_ms < ?', cutoff);
  return result.changes;
}
