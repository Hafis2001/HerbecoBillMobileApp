/**
 * Dashboard maths — kept free of React/RN so it can be reasoned about (and
 * tested) on its own.
 *
 * A range chooses both the window and the bucket size:
 *   day   -> last 14 days, one bar per day
 *   week  -> last 8 weeks, Monday-based, one bar per week
 *   month -> last 12 months, one bar per calendar month
 *   year  -> last 5 calendar years
 */

import type { Expense, InvoiceRecord, Unit } from '../types';

export type AnalyticsRange = 'day' | 'week' | 'month' | 'year';

export interface Bucket {
  key: string;
  /** Short label printed under the bar. */
  label: string;
  startMs: number;
  /** Exclusive end of the bucket. */
  endMs: number;
  total: number;
  bills: number;
}

export interface TopItem {
  name: string;
  unit: Unit;
  quantity: number;
  revenue: number;
}

export interface AnalyticsSummary {
  buckets: Bucket[];
  /** Totals for the CURRENT period (today / this week / this month / this year). */
  sales: number;
  bills: number;
  avgBill: number;
  discounts: number;
  referralSales: number;
  topItems: TopItem[];
  maxRevenue: number;
  /** Which period the totals above cover, e.g. "This month". */
  periodLabel: string;
  /** Sum of every bucket — 0 means nothing to draw in the trend chart. */
  trendTotal: number;
  /** Sales received in cash. */
  cashSales: number;
  /** Sales received via bank / UPI. */
  bankSales: number;
  /** Expenses paid in cash. */
  cashExpenses: number;
  /** Expenses paid via bank / UPI. */
  bankExpenses: number;
  /** Total expenses in this period. */
  totalExpenses: number;
  /** In-hand cash balance = cashSales - cashExpenses. */
  netCash: number;
  /** Net bank balance = bankSales - bankExpenses. */
  netBank: number;
  /** Net profit = total sales - total expenses. */
  netProfit: number;
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Monday-based start of the week that contains `d`. */
export function startOfWeek(d: Date): Date {
  const start = startOfDay(d);
  const offset = (start.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  start.setDate(start.getDate() - offset);
  return start;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The single period the filter stands for: Daily = today, Weekly = this week,
 * Monthly = this month, Yearly = this year. The KPI cards use it so each
 * filter shows its own real numbers instead of the same window total.
 */
export function periodBounds(
  range: AnalyticsRange,
  now: Date = new Date(),
): { label: string; startMs: number; endMs: number } {
  if (range === 'day') {
    const start = startOfDay(now);
    return { label: 'Today', startMs: start.getTime(), endMs: addDays(start, 1).getTime() };
  }
  if (range === 'week') {
    const start = startOfWeek(now);
    return { label: 'This week', startMs: start.getTime(), endMs: addDays(start, 7).getTime() };
  }
  if (range === 'month') {
    return {
      label: 'This month',
      startMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      endMs: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
    };
  }
  return {
    label: 'This year',
    startMs: new Date(now.getFullYear(), 0, 1).getTime(),
    endMs: new Date(now.getFullYear() + 1, 0, 1).getTime(),
  };
}

/** Empty, labelled buckets for the range, oldest first. */
export function buildBuckets(range: AnalyticsRange, now: Date = new Date()): Bucket[] {
  const buckets: Bucket[] = [];

  if (range === 'day') {
    for (let i = 13; i >= 0; i--) {
      const start = addDays(startOfDay(now), -i);
      const end = addDays(start, 1);
      buckets.push({
        key: `d-${start.toISOString().slice(0, 10)}`,
        label: String(start.getDate()),
        startMs: start.getTime(),
        endMs: end.getTime(),
        total: 0,
        bills: 0,
      });
    }
    return buckets;
  }

  if (range === 'week') {
    const thisWeek = startOfWeek(now);
    for (let i = 7; i >= 0; i--) {
      const start = addDays(thisWeek, -i * 7);
      const end = addDays(start, 7);
      buckets.push({
        key: `w-${start.toISOString().slice(0, 10)}`,
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        startMs: start.getTime(),
        endMs: end.getTime(),
        total: 0,
        bills: 0,
      });
    }
    return buckets;
  }

  if (range === 'month') {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        key: `m-${start.getFullYear()}-${start.getMonth() + 1}`,
        label: start.toLocaleDateString('en-IN', { month: 'short' }),
        startMs: start.getTime(),
        endMs: end.getTime(),
        total: 0,
        bills: 0,
      });
    }
    return buckets;
  }

  for (let i = 4; i >= 0; i--) {
    const year = now.getFullYear() - i;
    buckets.push({
      key: `y-${year}`,
      label: String(year),
      startMs: new Date(year, 0, 1).getTime(),
      endMs: new Date(year + 1, 0, 1).getTime(),
      total: 0,
      bills: 0,
    });
  }
  return buckets;
}

/** ₹1.2Cr / ₹1.2L / ₹12.5k / ₹840 — labels that fit above narrow bars. */
export function compactINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

/**
 * Fills the trend buckets from the whole bill history, and computes the KPI
 * cards + top products for the selected period (today / this week / this
 * month / this year) using the saved bills in SQLite.
 */
export function summarize(
  records: InvoiceRecord[],
  range: AnalyticsRange,
  now: Date = new Date(),
  expenses: Expense[] = [],
): AnalyticsSummary {
  const buckets = buildBuckets(range, now);

  // Fill the trend chart from every bucket, whatever the period filter is.
  for (const record of records) {
    const bucket = buckets.find(
      (b) => record.createdAtMs >= b.startMs && record.createdAtMs < b.endMs,
    );
    if (!bucket) continue;
    bucket.total += record.grandTotal;
    bucket.bills += 1;
  }

  const period = periodBounds(range, now);
  const inPeriod = records.filter(
    (r) => r.createdAtMs >= period.startMs && r.createdAtMs < period.endMs,
  );

  const sales = inPeriod.reduce((sum, r) => sum + r.grandTotal, 0);
  const discounts = inPeriod.reduce((sum, r) => sum + (r.discount ?? 0), 0);
  const referralSales = inPeriod
    .filter((r) => r.type === 'referral')
    .reduce((sum, r) => sum + r.grandTotal, 0);

  let cashSales = 0;
  let bankSales = 0;
  for (const record of inPeriod) {
    if (record.paymentMethod === 'bank') {
      bankSales += record.bankAmount > 0 ? record.bankAmount : record.grandTotal;
    } else if (record.paymentMethod === 'split') {
      bankSales += record.bankAmount;
      cashSales += record.cashAmount;
    } else {
      // Cash or legacy bills without paymentMethod
      cashSales += record.cashAmount > 0 ? record.cashAmount : record.grandTotal;
    }
  }

  // Filter expenses for this period
  const inPeriodExpenses = expenses.filter(
    (e) => e.createdAtMs >= period.startMs && e.createdAtMs < period.endMs,
  );

  const cashExpenses = inPeriodExpenses
    .filter((e) => e.paidVia === 'cash')
    .reduce((sum, e) => sum + e.amount, 0);
  const bankExpenses = inPeriodExpenses
    .filter((e) => e.paidVia === 'bank')
    .reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses = cashExpenses + bankExpenses;

  const netCash = cashSales - cashExpenses;
  const netBank = bankSales - bankExpenses;
  const netProfit = sales - totalExpenses;

  const byProduct = new Map<string, TopItem>();
  for (const record of inPeriod) {
    for (const item of record.items) {
      const key = `${item.name}|${item.unit}`;
      const line = byProduct.get(key) ?? {
        name: item.name,
        unit: item.unit,
        quantity: 0,
        revenue: 0,
      };
      line.quantity += item.quantity;
      line.revenue += item.unitPrice * item.quantity;
      byProduct.set(key, line);
    }
  }
  const topItems = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return {
    buckets,
    sales,
    bills: inPeriod.length,
    avgBill: inPeriod.length ? sales / inPeriod.length : 0,
    discounts,
    referralSales,
    topItems,
    maxRevenue: topItems[0]?.revenue ?? 0,
    periodLabel: period.label,
    trendTotal: buckets.reduce((sum, b) => sum + b.total, 0),
    cashSales,
    bankSales,
    cashExpenses,
    bankExpenses,
    totalExpenses,
    netCash,
    netBank,
    netProfit,
  };
}
