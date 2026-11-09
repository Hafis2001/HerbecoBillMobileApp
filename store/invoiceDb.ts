/**
 * Local SQLite storage for generated bills (Bills tab + dashboard).
 *
 * Every generated invoice is persisted with a "pending" status. The owner can
 * tap "Uploaded" once the bill has been uploaded manually (e.g. to the GST
 * portal). Bills are never auto-deleted — they stay until the owner deletes
 * them, so yearly reports and exports keep their history.
 */

import type {
  Expense,
  Invoice,
  InvoiceRecord,
  InvoiceStatus,
  ReferralCommissionLine,
  ReferralStat,
} from '../types';
import { getDatabase } from './db';
import { referralCommission, round2 } from '../utils/pricing';

/** Raw SQLite row shape for the invoices table. */
interface InvoiceRow {
  id: string;
  number: string;
  type: string;
  customer_name: string;
  customer_phone: string;
  items_json: string;
  subtotal: number;
  discount: number | null;
  gst: number;
  grand_total: number;
  created_at_ms: number;
  status: string;
  uploaded_at_ms: number | null;
  referral_code: string | null;
  referral_name: string | null;
  commission_paid: number | null;
  commission_paid_ms: number | null;
  payment_method: string | null;
  bank_amount: number | null;
  cash_amount: number | null;
  payment_confirmed: number | null;
}

const rowToRecord = (row: InvoiceRow): InvoiceRecord => ({
  id: row.id,
  number: row.number,
  type: row.type === 'referral' ? 'referral' : 'home',
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  items: JSON.parse(row.items_json),
  subtotal: row.subtotal,
  discount: row.discount ?? 0,
  gst: row.gst,
  grandTotal: row.grand_total,
  createdAtMs: row.created_at_ms,
  status: row.status === 'uploaded' ? 'uploaded' : 'pending',
  uploadedAtMs: row.uploaded_at_ms,
  referralCode: row.referral_code ?? null,
  referralName: row.referral_name ?? null,
  commissionPaid: Boolean(row.commission_paid),
  commissionPaidAtMs: row.commission_paid_ms ?? null,
  paymentMethod: (row.payment_method as 'cash' | 'bank' | 'split' | null) ?? null,
  bankAmount: row.bank_amount ?? 0,
  cashAmount: row.cash_amount ?? 0,
  paymentConfirmed: Boolean(row.payment_confirmed),
});

/** Persists a generated invoice (upsert by number, so re-generating is safe). */
export async function saveInvoice(invoice: Invoice): Promise<void> {
  const db = await getDatabase();
  const method = invoice.paymentMethod ?? 'cash';
  const bankAmt = invoice.bankAmount ?? (method === 'bank' ? invoice.grandTotal : 0);
  const cashAmt = invoice.cashAmount ?? (method === 'cash' ? invoice.grandTotal : 0);
  const confirmed = invoice.paymentConfirmed ? 1 : 0;

  await db.runAsync(
    `INSERT INTO invoices
       (id, number, type, customer_name, customer_phone, items_json,
        subtotal, discount, gst, grand_total, created_at_ms, status, uploaded_at_ms,
        referral_code, referral_name, payment_method, bank_amount, cash_amount, payment_confirmed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(number) DO UPDATE SET
       customer_name = excluded.customer_name,
       customer_phone = excluded.customer_phone,
       items_json = excluded.items_json,
       subtotal = excluded.subtotal,
       discount = excluded.discount,
       gst = excluded.gst,
       grand_total = excluded.grand_total,
       referral_code = excluded.referral_code,
       referral_name = excluded.referral_name,
       payment_method = COALESCE(excluded.payment_method, invoices.payment_method),
       bank_amount = COALESCE(excluded.bank_amount, invoices.bank_amount),
       cash_amount = COALESCE(excluded.cash_amount, invoices.cash_amount),
       payment_confirmed = COALESCE(excluded.payment_confirmed, invoices.payment_confirmed)`,
    invoice.number,
    invoice.number,
    invoice.type,
    invoice.customer.name,
    invoice.customer.phone,
    JSON.stringify(invoice.items),
    invoice.subtotal,
    invoice.discount ?? 0,
    invoice.gst,
    invoice.grandTotal,
    new Date(invoice.createdAt).getTime(),
    invoice.referral?.code ?? null,
    invoice.referral?.name ?? null,
    method,
    bankAmt,
    cashAmt,
    confirmed,
  );
}

/** One saved bill by its id (which is also the invoice number), or null. */
export async function getInvoiceRecord(id: string): Promise<InvoiceRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', id);
  return row ? rowToRecord(row) : null;
}

/** All saved bills, newest first. */
export async function getInvoiceRecords(): Promise<InvoiceRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<InvoiceRow>(
    'SELECT * FROM invoices ORDER BY created_at_ms DESC, number DESC',
  );
  return rows.map(rowToRecord);
}

/** Marks a bill as uploaded (or back to pending with status toggle). */
export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE invoices SET status = ?, uploaded_at_ms = ? WHERE id = ?',
    status,
    status === 'uploaded' ? Date.now() : null,
    id,
  );
}

export async function deleteInvoice(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM invoices WHERE id = ?', id);
}

/**
 * Bills, sales and the 10% commission per referral code — earnings are added
 * bill by bill so each line matches what the detail page shows, and split into
 * paid / still pending. Codes with no referral bills are absent from the map.
 */
export async function getReferralStats(): Promise<Record<string, ReferralStat>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    code: string;
    grand_total: number;
    commission_paid: number | null;
  }>(
    `SELECT referral_code AS code, grand_total, commission_paid
       FROM invoices
      WHERE referral_code IS NOT NULL AND referral_code <> ''`,
  );

  const stats: Record<string, ReferralStat> = {};
  for (const row of rows) {
    const commission = referralCommission(row.grand_total);
    const entry = (stats[row.code] ??= {
      bills: 0,
      sales: 0,
      earned: 0,
      paid: 0,
      pending: 0,
    });
    entry.bills += 1;
    entry.sales = round2(entry.sales + row.grand_total);
    entry.earned = round2(entry.earned + commission);
    if (row.commission_paid) entry.paid = round2(entry.paid + commission);
    else entry.pending = round2(entry.pending + commission);
  }
  return stats;
}

/**
 * Every commission a partner has earned — one line per referral bill, with the
 * purchase date, the bill amount and the 10% owed. Newest first.
 */
export async function getReferralCommissions(
  code: string,
): Promise<ReferralCommissionLine[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    number: string;
    grand_total: number;
    created_at_ms: number;
    commission_paid: number | null;
    commission_paid_ms: number | null;
  }>(
    `SELECT id, number, grand_total, created_at_ms, commission_paid, commission_paid_ms
       FROM invoices
      WHERE referral_code = ?
      ORDER BY created_at_ms DESC, number DESC`,
    code,
  );

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    purchaseMs: row.created_at_ms,
    billAmount: row.grand_total,
    commission: referralCommission(row.grand_total),
    paid: Boolean(row.commission_paid),
    paidAtMs: row.commission_paid_ms ?? null,
  }));
}

/** Marks one bill's referral commission as paid — or back to not paid. */
export async function setCommissionPaid(id: string, paid: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE invoices SET commission_paid = ?, commission_paid_ms = ? WHERE id = ?',
    paid ? 1 : 0,
    paid ? Date.now() : null,
    id,
  );
}

/**
 * Saves the payment method (cash/bank/split) and amounts against a bill.
 * Called when the cashier confirms payment on the bill screen.
 */
export async function updateBillPayment(
  id: string,
  method: 'cash' | 'bank' | 'split',
  bankAmount: number,
  cashAmount: number,
  confirmed: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE invoices SET payment_method = ?, bank_amount = ?, cash_amount = ?, payment_confirmed = ? WHERE id = ?',
    method,
    bankAmount,
    cashAmount,
    confirmed ? 1 : 0,
    id,
  );
}

// ─── Expense operations ───────────────────────────────────────────────────────

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  paid_via: string;
  category: string | null;
  created_at_ms: number;
}

function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount,
    paidVia: row.paid_via === 'bank' ? 'bank' : 'cash',
    category: row.category ?? undefined,
    createdAtMs: row.created_at_ms,
  };
}

/** Saves a new expense entry. */
export async function saveExpense(expense: Expense): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO expenses (id, description, amount, paid_via, category, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
    expense.id,
    expense.description,
    expense.amount,
    expense.paidVia,
    expense.category ?? null,
    expense.createdAtMs,
  );
}

/** All expenses, newest first. */
export async function getExpenses(): Promise<Expense[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    'SELECT * FROM expenses ORDER BY created_at_ms DESC',
  );
  return rows.map(rowToExpense);
}

/** Expenses within a time range (startMs inclusive, endMs exclusive). */
export async function getExpensesInRange(startMs: number, endMs: number): Promise<Expense[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    'SELECT * FROM expenses WHERE created_at_ms >= ? AND created_at_ms < ? ORDER BY created_at_ms DESC',
    startMs,
    endMs,
  );
  return rows.map(rowToExpense);
}

/** Deletes an expense by id. */
export async function deleteExpense(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM expenses WHERE id = ?', id);
}
