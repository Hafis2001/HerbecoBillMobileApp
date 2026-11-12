/**
 * Local SQLite storage for Stock Management and Production Management
 * (same herbeco.db as the bills — no backend, fully offline).
 *
 * Tables added here (all CREATE IF NOT EXISTS, so existing installs and
 * their bills / referrals / expenses are untouched):
 *
 *  stock_items        — every material and finished-good item
 *  stock_transactions — the stock ledger; one signed row per change
 *  recipes            — production products (name, unit, finished item)
 *  recipe_items       — ingredient lines of a recipe
 *  production_batches — completed batches with a frozen recipe snapshot
 *  product_stock_links— billing catalogue product → stock item mapping
 *  stock_meta         — small key/value store (batch counter)
 *
 * Design rules:
 *  - Quantities are stored as whole base units (grams / millilitres /
 *    pieces) so weight and volume maths never drift.
 *  - Balances are always derived from the ledger (SUM of qty_change);
 *    nothing is ever silently overwritten.
 *  - Production and bill settlement each run inside one SQLite
 *    transaction, so stock can never be half-updated.
 *  - Bill stock settlement is delta-based and idempotent: saving the same
 *    bill twice never deducts twice, and deleting a bill reverses it.
 */

import type {
  CartItem,
  Product,
  ProductStockLink,
  ProductionBatch,
  Recipe,
  RecipeItemLine,
  StockDisplayUnit,
  StockItem,
  StockKind,
  StockStatus,
  StockTransaction,
  StockTransactionType,
  StockUnitType,
  Unit,
} from '../types';
import { getDatabase } from './db';
import { makeId, useProductStore } from './productStore';
import { formatBaseQty, stockStatus } from '../utils/stock';

import type { SQLiteDatabase } from 'expo-sqlite';

// ─── Schema ───────────────────────────────────────────────────────────────

let schemaPromise: Promise<void> | null = null;

async function ensureColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (info.some((c) => c.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function ensureSchema(db: SQLiteDatabase): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS stock_items (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'General',
          kind TEXT NOT NULL DEFAULT 'material',
          unit_type TEXT NOT NULL,
          display_unit TEXT NOT NULL,
          min_qty_base INTEGER NOT NULL DEFAULT 0,
          purchase_price REAL,
          notes TEXT,
          recipe_id TEXT,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_stock_items_name ON stock_items (name COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS stock_transactions (
          id TEXT PRIMARY KEY NOT NULL,
          item_id TEXT NOT NULL,
          type TEXT NOT NULL,
          qty_change INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          unit_price REAL,
          supplier TEXT,
          ref_type TEXT,
          ref_id TEXT,
          note TEXT,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_stock_txn_item ON stock_transactions (item_id, created_at_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_stock_txn_ref ON stock_transactions (ref_type, ref_id);

        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          image_uri TEXT,
          price REAL NOT NULL DEFAULT 0,
          finished_unit TEXT NOT NULL DEFAULT 'unit',
          notes TEXT,
          finished_item_id TEXT NOT NULL,
          product_id TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recipe_items (
          id TEXT PRIMARY KEY NOT NULL,
          recipe_id TEXT NOT NULL,
          stock_item_id TEXT NOT NULL,
          qty_per_unit_base REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items (recipe_id);

        CREATE TABLE IF NOT EXISTS production_batches (
          id TEXT PRIMARY KEY NOT NULL,
          batch_no TEXT NOT NULL UNIQUE,
          recipe_id TEXT NOT NULL,
          recipe_name TEXT NOT NULL,
          finished_unit TEXT NOT NULL DEFAULT 'unit',
          quantity REAL NOT NULL,
          finished_qty_base INTEGER NOT NULL,
          finished_item_id TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          notes TEXT,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_batches_created ON production_batches (created_at_ms DESC);

        CREATE TABLE IF NOT EXISTS product_stock_links (
          product_id TEXT PRIMARY KEY NOT NULL,
          stock_item_id TEXT NOT NULL,
          qty_base_per_unit INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);

      await ensureColumn(db, 'recipes', 'price', 'REAL NOT NULL DEFAULT 0');
      await ensureColumn(db, 'recipes', 'product_id', 'TEXT');

      const dedupeDone = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM stock_meta WHERE key = 'stock_dedupe_v1'`,
      );
      if (!dedupeDone) {
        try {
          await db.withTransactionAsync(async () => {
            await repairDuplicateStockItemsWithDb(db);
          });
          await db.runAsync(
            `INSERT INTO stock_meta (key, value) VALUES ('stock_dedupe_v1', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [String(Date.now())],
          );
        } catch (e) {
          console.log('stock dedupe error', e);
        }
      }
    })();
  }
  return schemaPromise;
}

export async function getStockDb(): Promise<SQLiteDatabase> {
  const db = await getDatabase();
  await ensureSchema(db);
  return db;
}

// ─── Row shapes & mappers ──────────────────────────────────────────────────

interface StockItemRow {
  id: string;
  name: string;
  category: string;
  kind: string;
  unit_type: string;
  display_unit: string;
  min_qty_base: number;
  purchase_price: number | null;
  notes: string | null;
  recipe_id: string | null;
  created_at_ms: number;
  balance: number | null;
}

function rowToStockItem(row: StockItemRow): StockItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    kind: row.kind === 'finished' ? 'finished' : 'material',
    unitType: (row.unit_type as StockUnitType) === 'volume' ? 'volume' : (row.unit_type as StockUnitType) === 'piece' ? 'piece' : 'weight',
    displayUnit: row.display_unit as StockDisplayUnit,
    minQtyBase: row.min_qty_base ?? 0,
    purchasePrice: row.purchase_price ?? undefined,
    notes: row.notes ?? undefined,
    recipeId: row.recipe_id ?? undefined,
    createdAtMs: row.created_at_ms,
    balance: row.balance ?? 0,
  };
}

interface TxnRow {
  id: string;
  item_id: string;
  type: string;
  qty_change: number;
  balance_after: number;
  unit_price: number | null;
  supplier: string | null;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at_ms: number;
}

const TXN_TYPES: StockTransactionType[] = [
  'opening',
  'restock',
  'adjust',
  'production_use',
  'production_out',
  'sale',
  'sale_reversal',
];

function rowToTxn(row: TxnRow): StockTransaction {
  const type = (TXN_TYPES.includes(row.type as StockTransactionType)
    ? row.type
    : 'adjust') as StockTransactionType;
  return {
    id: row.id,
    itemId: row.item_id,
    type,
    qtyChange: row.qty_change,
    balanceAfter: row.balance_after,
    unitPrice: row.unit_price ?? undefined,
    supplier: row.supplier ?? undefined,
    refType: (row.ref_type as 'bill' | 'batch' | null) ?? null,
    refId: row.ref_id ?? null,
    note: row.note ?? undefined,
    createdAtMs: row.created_at_ms,
  };
}

interface RecipeRow {
  id: string;
  name: string;
  image_uri: string | null;
  price: number | null;
  finished_unit: string;
  notes: string | null;
  finished_item_id: string;
  product_id: string | null;
  created_at_ms: number;
  updated_at_ms: number;
}

interface BatchRow {
  id: string;
  batch_no: string;
  recipe_id: string;
  recipe_name: string;
  finished_unit: string;
  quantity: number;
  finished_qty_base: number;
  finished_item_id: string;
  snapshot_json: string;
  notes: string | null;
  created_at_ms: number;
}

function rowToBatch(row: BatchRow): ProductionBatch {
  return {
    id: row.id,
    batchNo: row.batch_no,
    recipeId: row.recipe_id,
    recipeName: row.recipe_name,
    finishedUnit: row.finished_unit || 'piece',
    quantity: row.quantity,
    finishedQtyBase: row.finished_qty_base,
    finishedItemId: row.finished_item_id,
    snapshot: JSON.parse(row.snapshot_json) as ProductionBatch['snapshot'],
    notes: row.notes ?? undefined,
    createdAtMs: row.created_at_ms,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────

async function getBalanceRaw(db: SQLiteDatabase, itemId: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(qty_change) AS total FROM stock_transactions WHERE item_id = ?',
    itemId,
  );
  return row?.total != null ? Math.round((row.total + Number.EPSILON) * 10000) / 10000 : 0;
}

interface InsertTxnInput {
  itemId: string;
  type: StockTransactionType;
  qtyChange: number;
  unitPrice?: number;
  supplier?: string;
  refType?: 'bill' | 'batch' | null;
  refId?: string | null;
  note?: string;
  createdAtMs?: number;
}

/** Inserts one ledger row, computing balance_after from the current sum. */
async function insertTxn(db: SQLiteDatabase, input: InsertTxnInput): Promise<void> {
  const balance = await getBalanceRaw(db, input.itemId);
  const change = Math.round((input.qtyChange + Number.EPSILON) * 10000) / 10000;
  const balanceAfter = Math.round((balance + change + Number.EPSILON) * 10000) / 10000;
  const createdAt = input.createdAtMs ?? Date.now();
  await db.runAsync(
    `INSERT INTO stock_transactions
       (id, item_id, type, qty_change, balance_after, unit_price, supplier, ref_type, ref_id, note, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      makeId(),
      input.itemId,
      input.type,
      change,
      balanceAfter,
      input.unitPrice ?? null,
      input.supplier ?? null,
      input.refType ?? null,
      input.refId ?? null,
      input.note ?? null,
      createdAt,
    ],
  );
}

// ─── Stock items ───────────────────────────────────────────────────────────

export interface StockItemInput {
  name: string;
  category: string;
  unitType: StockUnitType;
  displayUnit: StockDisplayUnit;
  minQtyBase: number;
  purchasePrice?: number;
  notes?: string;
  kind?: StockKind;
  recipeId?: string;
}

export async function getStockItems(): Promise<StockItem[]> {
  const db = await getStockDb();
  const rows = await db.getAllAsync<StockItemRow>(
    `SELECT i.*, COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = i.id), 0) AS balance
       FROM stock_items i
      ORDER BY i.name COLLATE NOCASE`,
  );
  return rows.map(rowToStockItem);
}

export async function getStockItem(id: string): Promise<StockItem | null> {
  const db = await getStockDb();
  const row = await db.getFirstAsync<StockItemRow>(
    `SELECT i.*, COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = i.id), 0) AS balance
       FROM stock_items i WHERE i.id = ?`,
    id,
  );
  return row ? rowToStockItem(row) : null;
}

/** Creates an item and its Opening Stock ledger row in one transaction. */
export async function createStockItem(
  input: StockItemInput,
  openingQtyBase: number,
): Promise<string> {
  const db = await getStockDb();
  const id = makeId();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO stock_items
         (id, name, category, kind, unit_type, display_unit, min_qty_base, purchase_price, notes, recipe_id, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name.trim(),
        input.category.trim() || 'General',
        input.kind ?? 'material',
        input.unitType,
        input.displayUnit,
        Math.max(0, Math.round((input.minQtyBase + Number.EPSILON) * 10000) / 10000),
        input.purchasePrice ?? null,
        input.notes?.trim() || null,
        input.recipeId ?? null,
        Date.now(),
      ],
    );
    if (openingQtyBase > 0) {
      await insertTxn(db, {
        itemId: id,
        type: 'opening',
        qtyChange: openingQtyBase,
        note: 'Opening stock',
      });
    }
  });
  return id;
}

// ─── Product-backed stock items ────────────────────────────────────────────

interface EnsureProductStockOptions {
  category?: string;
  notes?: string;
}

interface EnsureProductStockResult {
  stockItemId: string;
  created: boolean;
}

/**
 * Returns the stock item linked to a billing product, creating it (and the
 * link) on first use. Every product therefore has exactly one stock entry,
 * no matter whether it was reached from Stock, Production or billing.
 */
async function ensureProductStockItemWithDb(
  db: SQLiteDatabase,
  product: Product,
  kind: StockKind,
  options?: EnsureProductStockOptions,
): Promise<EnsureProductStockResult> {
  const isKg = product.unit === 'kg';
  const unitType: StockUnitType = isKg ? 'weight' : 'piece';
  const displayUnit: StockDisplayUnit = isKg ? 'kg' : 'piece';
  const qtyBasePerUnit = isKg ? 1000 : 1;
  const now = Date.now();
  const trimmedName = product.name.trim();

  const link = await db.getFirstAsync<{ stock_item_id: string }>(
    'SELECT stock_item_id FROM product_stock_links WHERE product_id = ?',
    product.id,
  );
  if (link) {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM stock_items WHERE id = ?',
      link.stock_item_id,
    );
    if (existing) return { stockItemId: existing.id, created: false };
  }

  // If a stock item with the same name already exists (for example, a material
  // added before products were linked), reuse it instead of creating a duplicate.
  const sameName = await db.getFirstAsync<{ id: string }>(
    `SELECT i.id
       FROM stock_items i
      WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(?))
        AND i.unit_type = ?
        AND i.kind = ?
      ORDER BY (SELECT COUNT(*) FROM stock_transactions t WHERE t.item_id = i.id) DESC,
               (SELECT COUNT(*) FROM product_stock_links l WHERE l.stock_item_id = i.id) DESC,
               i.created_at_ms ASC
      LIMIT 1`,
    trimmedName,
    unitType,
    kind,
  );
  if (sameName) {
    await db.runAsync(
      `INSERT INTO product_stock_links (product_id, stock_item_id, qty_base_per_unit, created_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         stock_item_id = excluded.stock_item_id,
         qty_base_per_unit = excluded.qty_base_per_unit`,
      [product.id, sameName.id, qtyBasePerUnit, now],
    );
    return { stockItemId: sameName.id, created: false };
  }

  const id = makeId();
  await db.runAsync(
    `INSERT INTO stock_items
       (id, name, category, kind, unit_type, display_unit, min_qty_base, purchase_price, notes, recipe_id, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?)`,
    [
      id,
      trimmedName,
      options?.category?.trim() || 'General',
      kind,
      unitType,
      displayUnit,
      options?.notes?.trim() || null,
      now,
    ],
  );
  await db.runAsync(
    `INSERT INTO product_stock_links (product_id, stock_item_id, qty_base_per_unit, created_at_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       stock_item_id = excluded.stock_item_id,
       qty_base_per_unit = excluded.qty_base_per_unit`,
    [product.id, id, qtyBasePerUnit, now],
  );
  return { stockItemId: id, created: true };
}

/**
 * Collapses accidental duplicate stock items (same name and unit type) into
 * one canonical item. This keeps production deductions and stock balances on
 * the same row when older data created a second item for the same material.
 */
async function repairDuplicateStockItemsWithDb(db: SQLiteDatabase): Promise<void> {
  const groups = await db.getAllAsync<{ name_norm: string; unit_type: string; kind: StockKind }>(
    `SELECT LOWER(TRIM(name)) AS name_norm, unit_type, kind
       FROM stock_items
      GROUP BY LOWER(TRIM(name)), unit_type, kind
      HAVING COUNT(*) > 1`,
  );

  for (const group of groups) {
    const rows = await db.getAllAsync<{
      id: string;
      txn_count: number;
      link_count: number;
      created_at_ms: number;
    }>(
      `SELECT i.id,
              (SELECT COUNT(*) FROM stock_transactions t WHERE t.item_id = i.id) AS txn_count,
              (SELECT COUNT(*) FROM product_stock_links l WHERE l.stock_item_id = i.id) AS link_count,
              i.created_at_ms
         FROM stock_items i
        WHERE LOWER(TRIM(i.name)) = ? AND i.unit_type = ? AND i.kind = ?
        ORDER BY txn_count DESC, link_count DESC, i.created_at_ms ASC`,
      group.name_norm,
      group.unit_type,
      group.kind,
    );
    if (rows.length < 2) continue;

    const canonical = rows[0];
    for (const duplicate of rows.slice(1)) {
      await db.runAsync('UPDATE stock_transactions SET item_id = ? WHERE item_id = ?', [
        canonical.id,
        duplicate.id,
      ]);

      const duplicateLines = await db.getAllAsync<{
        id: string;
        recipe_id: string;
        qty_per_unit_base: number;
      }>(
        'SELECT id, recipe_id, qty_per_unit_base FROM recipe_items WHERE stock_item_id = ?',
        duplicate.id,
      );
      for (const line of duplicateLines) {
        const existingLine = await db.getFirstAsync<{
          id: string;
          qty_per_unit_base: number;
        }>(
          `SELECT id, qty_per_unit_base FROM recipe_items
            WHERE recipe_id = ? AND stock_item_id = ? LIMIT 1`,
          line.recipe_id,
          canonical.id,
        );
        if (existingLine) {
          const mergedQty =
            Math.round((existingLine.qty_per_unit_base + line.qty_per_unit_base) * 10000) / 10000;
          await db.runAsync('UPDATE recipe_items SET qty_per_unit_base = ? WHERE id = ?', [
            mergedQty,
            existingLine.id,
          ]);
          await db.runAsync('DELETE FROM recipe_items WHERE id = ?', [line.id]);
        } else {
          await db.runAsync('UPDATE recipe_items SET stock_item_id = ? WHERE id = ?', [
            canonical.id,
            line.id,
          ]);
        }
      }

      await db.runAsync('UPDATE product_stock_links SET stock_item_id = ? WHERE stock_item_id = ?', [
        canonical.id,
        duplicate.id,
      ]);
      await db.runAsync('UPDATE recipes SET finished_item_id = ? WHERE finished_item_id = ?', [
        canonical.id,
        duplicate.id,
      ]);
      await db.runAsync(
        'UPDATE production_batches SET finished_item_id = ? WHERE finished_item_id = ?',
        [canonical.id, duplicate.id],
      );
      await db.runAsync('DELETE FROM stock_items WHERE id = ?', [duplicate.id]);
    }

    // Recompute the running balance after the merged ledgers are combined.
    const txns = await db.getAllAsync<{ id: string; qty_change: number }>(
      'SELECT id, qty_change FROM stock_transactions WHERE item_id = ? ORDER BY created_at_ms ASC, rowid ASC',
      canonical.id,
    );
    let running = 0;
    for (const txn of txns) {
      running += txn.qty_change;
      const balanceAfter = Math.round((running + Number.EPSILON) * 10000) / 10000;
      await db.runAsync('UPDATE stock_transactions SET balance_after = ? WHERE id = ?', [
        balanceAfter,
        txn.id,
      ]);
    }
  }
}

/** Public wrapper: ensures a product has a stock item and returns its id. */
export async function ensureProductStockItem(
  product: Product,
  kind: StockKind = 'material',
  options?: EnsureProductStockOptions,
): Promise<string> {
  const db = await getStockDb();
  const result = await ensureProductStockItemWithDb(db, product, kind, options);
  return result.stockItemId;
}

export interface AddProductStockInput {
  product: Product;
  category: string;
  displayUnit: StockDisplayUnit;
  minQtyBase: number;
  purchasePrice?: number;
  notes?: string;
  /** Opening stock for a new item, or the quantity added to an existing one. */
  qtyBase: number;
}

/**
 * Adds stock for a product picked from the Products catalogue. The first
 * call creates the product's stock item (with an opening entry); later calls
 * reuse it and record a normal restock.
 */
export async function addStockForProduct(
  input: AddProductStockInput,
): Promise<{ stockItemId: string; created: boolean }> {
  const db = await getStockDb();
  let result: EnsureProductStockResult = { stockItemId: '', created: false };
  await db.withTransactionAsync(async () => {
    const ensured = await ensureProductStockItemWithDb(db, input.product, 'material', {
      category: input.category,
    });
    result = ensured;
    await db.runAsync(
      `UPDATE stock_items
          SET name = ?, category = ?, display_unit = ?, min_qty_base = ?, purchase_price = ?, notes = ?
        WHERE id = ?`,
      [
        input.product.name.trim(),
        input.category.trim() || 'General',
        input.displayUnit,
        Math.max(0, Math.round((input.minQtyBase + Number.EPSILON) * 10000) / 10000),
        input.purchasePrice ?? null,
        input.notes?.trim() || null,
        ensured.stockItemId,
      ],
    );
    if (input.qtyBase > 0) {
      await insertTxn(db, {
        itemId: ensured.stockItemId,
        type: ensured.created ? 'opening' : 'restock',
        qtyChange: input.qtyBase,
        unitPrice: input.purchasePrice,
        note: ensured.created ? 'Opening stock' : undefined,
      });
    }
  });
  return result;
}

/**
 * Updates the editable details. Allows changing display unit within the
 * same unit type without losing balance accuracy.
 */
export async function updateStockItemDetails(
  id: string,
  patch: {
    name: string;
    category: string;
    displayUnit?: StockDisplayUnit;
    minQtyBase: number;
    purchasePrice?: number;
    notes?: string;
  },
): Promise<void> {
  const db = await getStockDb();
  await db.runAsync(
    `UPDATE stock_items
        SET name = ?, category = ?, display_unit = COALESCE(?, display_unit), min_qty_base = ?, purchase_price = ?, notes = ?
      WHERE id = ?`,
    [
      patch.name.trim(),
      patch.category.trim() || 'General',
      patch.displayUnit?.trim() || null,
      Math.max(0, Math.round(patch.minQtyBase * 10000) / 10000),
      patch.purchasePrice ?? null,
      patch.notes?.trim() || null,
      id,
    ],
  );
}

/** Items with stock history cannot be deleted — the ledger is permanent. */
export async function deleteStockItem(id: string): Promise<void> {
  const db = await getStockDb();
  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM stock_transactions WHERE item_id = ?',
    id,
  );
  if ((countRow?.count ?? 0) > 0) {
    throw new Error('This item has stock history and cannot be deleted.');
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM recipe_items WHERE stock_item_id = ?', id);
    await db.runAsync('DELETE FROM product_stock_links WHERE stock_item_id = ?', id);
    await db.runAsync('DELETE FROM stock_items WHERE id = ?', id);
  });
}

// ─── Restock / adjustment ──────────────────────────────────────────────────

export interface RestockInput {
  itemId: string;
  qtyBase: number;
  purchasePrice?: number;
  supplier?: string;
  note?: string;
  createdAtMs?: number;
}

export async function recordRestock(input: RestockInput): Promise<void> {
  const db = await getStockDb();

  // Produced items are made from their recipe, not bought directly. Restocking
  // one therefore runs the same ingredient deduction as a production batch.
  const recipe = await db.getFirstAsync<{ id: string; finished_unit: string }>(
    `SELECT id, finished_unit FROM recipes
      WHERE finished_item_id = ?
      ORDER BY created_at_ms DESC
      LIMIT 1`,
    input.itemId,
  );
  if (recipe) {
    const finishedUnit = recipe.finished_unit.trim().toLowerCase();
    const quantity = finishedUnit === 'kg' ? input.qtyBase / 1000 : input.qtyBase;
    const result = await createProductionBatch(
      recipe.id,
      quantity,
      input.note,
      input.createdAtMs,
    );
    if (!result.ok) {
      const shortageText = (result.shortages ?? [])
        .map((shortage) => `${shortage.name} needs ${formatBaseQty(shortage.shortfallBase, shortage.unitType)} more`)
        .join(', ');
      throw new Error(
        shortageText
          ? `Not enough ingredients to produce this item: ${shortageText}`
          : 'Not enough ingredients to produce this item.',
      );
    }
    return;
  }

  await db.withTransactionAsync(async () => {
    await insertTxn(db, {
      itemId: input.itemId,
      type: 'restock',
      qtyChange: input.qtyBase,
      unitPrice: input.purchasePrice,
      supplier: input.supplier?.trim() || undefined,
      note: input.note?.trim() || undefined,
      createdAtMs: input.createdAtMs,
    });
  });
}

export interface AdjustInput {
  itemId: string;
  /** Signed: positive increases stock, negative decreases it. */
  qtyChangeBase: number;
  reason: string;
  createdAtMs?: number;
}

/** Manual adjustments; a decrease can never take stock below zero. */
export async function recordAdjustment(input: AdjustInput): Promise<void> {
  const db = await getStockDb();
  const qty = Math.round((input.qtyChangeBase + Number.EPSILON) * 10000) / 10000;
  if (qty === 0) throw new Error('Adjustment quantity cannot be zero.');
  await db.withTransactionAsync(async () => {
    if (qty < 0) {
      const balance = await getBalanceRaw(db, input.itemId);
      if (balance + qty < 0) {
        throw new Error('Adjustment would make the stock negative.');
      }
    }
    await insertTxn(db, {
      itemId: input.itemId,
      type: 'adjust',
      qtyChange: qty,
      note: input.reason.trim(),
      createdAtMs: input.createdAtMs,
    });
  });
}

// ─── Ledger reads ──────────────────────────────────────────────────────────

export async function getStockTransactions(itemId: string): Promise<StockTransaction[]> {
  const db = await getStockDb();
  const rows = await db.getAllAsync<TxnRow>(
    `SELECT rowid AS _row, * FROM stock_transactions
      WHERE item_id = ?
      ORDER BY created_at_ms DESC, _row DESC`,
    itemId,
  );
  return rows.map(rowToTxn);
}

export interface StockSummary {
  totalItems: number;
  materialCount: number;
  finishedCount: number;
  lowCount: number;
  outCount: number;
  totalValue: number;
}

export function summarizeStock(items: StockItem[]): StockSummary {
  const summary: StockSummary = {
    totalItems: items.length,
    materialCount: 0,
    finishedCount: 0,
    lowCount: 0,
    outCount: 0,
    totalValue: 0,
  };
  for (const item of items) {
    if (item.kind === 'finished') summary.finishedCount += 1;
    else summary.materialCount += 1;
    const status = stockStatus(item.balance, item.minQtyBase);
    if (status === 'low') summary.lowCount += 1;
    if (status === 'out') summary.outCount += 1;
    if (item.purchasePrice) {
      const qty = item.balance / (item.displayUnit === 'kg' || item.displayUnit === 'l' ? 1000 : 1);
      summary.totalValue = Math.round((summary.totalValue + qty * item.purchasePrice) * 100) / 100;
    }
  }
  return summary;
}

// ─── Recipes (production products) ─────────────────────────────────────────

export interface RecipeIngredientInput {
  stockItemId: string;
  qtyPerUnitBase: number;
}

export interface RecipeInput {
  name: string;
  imageUri?: string;
  /** Selling rate / price per finished unit. */
  price: number;
  /** Finished unit, e.g. 'bottle', 'piece', 'packet', 'box', 'kg'. */
  finishedUnit: string;
  notes?: string;
  /** Billing product selected from the catalogue. */
  productId?: string;
  items: RecipeIngredientInput[];
}

async function loadRecipeItems(db: SQLiteDatabase, recipeId: string): Promise<RecipeItemLine[]> {
  const rows = await db.getAllAsync<{ id: string; recipe_id: string; stock_item_id: string; qty_per_unit_base: number }>(
    'SELECT id, recipe_id, stock_item_id, qty_per_unit_base FROM recipe_items WHERE recipe_id = ?',
    recipeId,
  );
  return rows.map((row) => ({
    id: row.id,
    recipeId: row.recipe_id,
    stockItemId: row.stock_item_id,
    qtyPerUnitBase: row.qty_per_unit_base,
  }));
}

async function loadRecipe(db: SQLiteDatabase, id: string): Promise<Recipe | null> {
  const row = await db.getFirstAsync<RecipeRow>('SELECT * FROM recipes WHERE id = ?', id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    imageUri: row.image_uri ?? undefined,
    price: row.price ?? 0,
    finishedUnit: row.finished_unit || 'piece',
    notes: row.notes ?? undefined,
    finishedItemId: row.finished_item_id,
    productId: row.product_id ?? undefined,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
    items: await loadRecipeItems(db, row.id),
  };
}

export async function getRecipes(): Promise<Recipe[]> {
  const db = await getStockDb();
  const rows = await db.getAllAsync<RecipeRow>(
    'SELECT * FROM recipes ORDER BY name COLLATE NOCASE',
  );
  const recipes: Recipe[] = [];
  for (const row of rows) {
    recipes.push({
      id: row.id,
      name: row.name,
      imageUri: row.image_uri ?? undefined,
      price: row.price ?? 0,
      finishedUnit: row.finished_unit || 'piece',
      notes: row.notes ?? undefined,
      finishedItemId: row.finished_item_id,
      productId: row.product_id ?? undefined,
      createdAtMs: row.created_at_ms,
      updatedAtMs: row.updated_at_ms,
      items: await loadRecipeItems(db, row.id),
    });
  }
  return recipes;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const db = await getStockDb();
  return loadRecipe(db, id);
}

/**
 * Creates a recipe for a product picked from the billing catalogue. The
 * product's stock item is created on first use and reused afterwards, so
 * Stock, Production and billing all point at the same stock entry.
 */
export async function saveRecipe(input: RecipeInput): Promise<string> {
  const db = await getStockDb();
  const recipeId = makeId();
  const now = Date.now();
  const trimmedName = input.name.trim();
  const unitLower = (input.finishedUnit || 'piece').trim().toLowerCase();
  const isKg = unitLower === 'kg';
  const billingUnit: Unit = isKg ? 'kg' : 'unit';

  // 1. Resolve the selected product (falling back to a name match/copy).
  const currentProducts = useProductStore.getState().products;
  let productId = input.productId;
  let existingProduct = productId
    ? currentProducts.find((p) => p.id === productId)
    : undefined;
  if (!existingProduct) {
    existingProduct = currentProducts.find(
      (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
  }
  if (!productId) productId = existingProduct?.id ?? makeId();

  const product: Product = {
    id: productId,
    name: trimmedName,
    price: input.price,
    unit: billingUnit,
    imageUri: input.imageUri,
    createdAt: existingProduct?.createdAt ?? now,
  };
  if (existingProduct) {
    useProductStore.getState().updateProduct(productId, {
      name: trimmedName,
      price: input.price,
      unit: billingUnit,
      imageUri: input.imageUri,
    });
  } else {
    useProductStore.getState().upsertProduct(product);
  }

  let finishedItemId = '';
  await db.withTransactionAsync(async () => {
    // 2. Use the product's stock item (created on first use, reused after).
    const ensured = await ensureProductStockItemWithDb(db, product, 'finished', {
      category: 'Finished Goods',
      notes: `Produced from the ${trimmedName} recipe`,
    });
    finishedItemId = ensured.stockItemId;

    // 3. Insert recipe with price, finished_unit, and product_id
    await db.runAsync(
      `INSERT INTO recipes (id, name, image_uri, price, finished_unit, notes, finished_item_id, product_id, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recipeId,
        trimmedName,
        input.imageUri ?? null,
        input.price,
        input.finishedUnit.trim(),
        input.notes?.trim() || null,
        finishedItemId,
        productId,
        now,
        now,
      ],
    );

    // 4. Insert recipe ingredients
    for (const ingredient of input.items) {
      await db.runAsync(
        `INSERT INTO recipe_items (id, recipe_id, stock_item_id, qty_per_unit_base) VALUES (?, ?, ?, ?)`,
        [makeId(), recipeId, ingredient.stockItemId, Math.round(ingredient.qtyPerUnitBase * 10000) / 10000],
      );
    }

    // 5. Link billing product to finished good stock item
    const qtyBasePerUnit = isKg ? 1000 : 1;
    await db.runAsync(
      `INSERT INTO product_stock_links (product_id, stock_item_id, qty_base_per_unit, created_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         stock_item_id = excluded.stock_item_id,
         qty_base_per_unit = excluded.qty_base_per_unit`,
      [productId, finishedItemId, qtyBasePerUnit, now],
    );
  });

  return recipeId;
}

/**
 * Updates a recipe's details, rate, and ingredient lines, and synchronizes
 * the updated rate and details with the billing catalogue.
 */
export async function updateRecipe(
  id: string,
  input: RecipeInput,
): Promise<void> {
  const db = await getStockDb();
  const now = Date.now();
  const trimmedName = input.name.trim();
  const unitLower = (input.finishedUnit || 'piece').trim().toLowerCase();
  const isKg = unitLower === 'kg';
  const unitType: StockUnitType = isKg ? 'weight' : 'piece';
  const displayUnit = isKg ? 'kg' : (input.finishedUnit.trim() || 'piece');
  const billingUnit: Unit = isKg ? 'kg' : 'unit';

  await db.withTransactionAsync(async () => {
    const recipe = await loadRecipe(db, id);
    if (!recipe) throw new Error('Recipe not found.');

    const currentProducts = useProductStore.getState().products;
    let productId = input.productId ?? recipe.productId;
    let existingProduct = productId
      ? currentProducts.find((p) => p.id === productId)
      : undefined;
    if (!existingProduct) {
      existingProduct = currentProducts.find(
        (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      );
    }
    if (!productId) productId = existingProduct?.id ?? makeId();

    const product: Product = {
      id: productId,
      name: trimmedName,
      price: input.price,
      unit: billingUnit,
      imageUri: input.imageUri,
      createdAt: existingProduct?.createdAt ?? recipe.createdAtMs,
    };
    useProductStore.getState().upsertProduct(product);

    // Reuse (or create) the selected product's stock item.
    const ensured = await ensureProductStockItemWithDb(db, product, 'finished', {
      category: 'Finished Goods',
      notes: `Produced from the ${trimmedName} recipe`,
    });
    const finishedItemId = ensured.stockItemId;

    await db.runAsync(
      `UPDATE recipes
          SET name = ?, image_uri = ?, price = ?, finished_unit = ?, notes = ?, product_id = ?, finished_item_id = ?, updated_at_ms = ?
        WHERE id = ?`,
      [
        trimmedName,
        input.imageUri ?? null,
        input.price,
        input.finishedUnit.trim(),
        input.notes?.trim() || null,
        productId,
        finishedItemId,
        now,
        id,
      ],
    );

    await db.runAsync(
      'UPDATE stock_items SET name = ?, unit_type = ?, display_unit = ? WHERE id = ?',
      [trimmedName, unitType, displayUnit, finishedItemId],
    );

    await db.runAsync('DELETE FROM recipe_items WHERE recipe_id = ?', id);
    for (const ingredient of input.items) {
      await db.runAsync(
        `INSERT INTO recipe_items (id, recipe_id, stock_item_id, qty_per_unit_base) VALUES (?, ?, ?, ?)`,
        [makeId(), id, ingredient.stockItemId, Math.round(ingredient.qtyPerUnitBase * 10000) / 10000],
      );
    }

    // Keep product link in sync
    const qtyBasePerUnit = isKg ? 1000 : 1;
    await db.runAsync(
      `INSERT INTO product_stock_links (product_id, stock_item_id, qty_base_per_unit, created_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         stock_item_id = excluded.stock_item_id,
         qty_base_per_unit = excluded.qty_base_per_unit`,
      [productId, finishedItemId, qtyBasePerUnit, now],
    );
  });
}

/**
 * Ensures all recipes have a corresponding Product in useProductStore
 * and are linked in product_stock_links. Safe to call repeatedly.
 */
export async function syncRecipeBillingProducts(): Promise<void> {
  const db = await getStockDb();
  const recipes = await getRecipes();
  const currentProducts = useProductStore.getState().products;

  for (const recipe of recipes) {
    const isKg = recipe.finishedUnit.trim().toLowerCase() === 'kg';
    const billingUnit: Unit = isKg ? 'kg' : 'unit';

    let product = currentProducts.find((p) => p.id === recipe.productId);
    if (!product) {
      product = currentProducts.find(
        (p) => p.name.trim().toLowerCase() === recipe.name.trim().toLowerCase(),
      );
    }

    const productId = product ? product.id : makeId();

    useProductStore.getState().upsertProduct({
      id: productId,
      name: recipe.name,
      price: recipe.price || product?.price || 0,
      unit: billingUnit,
      imageUri: recipe.imageUri || product?.imageUri,
      createdAt: recipe.createdAtMs,
    });

    if (recipe.productId !== productId) {
      await db.runAsync('UPDATE recipes SET product_id = ? WHERE id = ?', [productId, recipe.id]);
    }

    const qtyBasePerUnit = isKg ? 1000 : 1;
    await db.runAsync(
      `INSERT INTO product_stock_links (product_id, stock_item_id, qty_base_per_unit, created_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         stock_item_id = excluded.stock_item_id,
         qty_base_per_unit = excluded.qty_base_per_unit`,
      [productId, recipe.finishedItemId, qtyBasePerUnit, Date.now()],
    );
  }
}

/**
 * Map of billing products to available stock and measurement info.
 */
export interface ProductStockInfo {
  availableUnits: number;
  stockItemId: string;
  stockItemName: string;
  unitType: StockUnitType;
  displayUnit: string;
  balanceBase: number;
}

export async function getProductStockBalances(): Promise<Record<string, ProductStockInfo>> {
  const db = await getStockDb();
  const rows = await db.getAllAsync<{
    product_id: string;
    stock_item_id: string;
    qty_base_per_unit: number;
    stock_name: string;
    unit_type: string;
    display_unit: string;
    balance: number | null;
  }>(
    `SELECT l.product_id, l.stock_item_id, l.qty_base_per_unit, s.name AS stock_name, s.unit_type, s.display_unit,
            COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = s.id), 0) AS balance
       FROM product_stock_links l
       JOIN stock_items s ON s.id = l.stock_item_id`,
  );

  const result: Record<string, ProductStockInfo> = {};
  for (const r of rows) {
    const balance = r.balance ?? 0;
    const qtyBase = r.qty_base_per_unit > 0 ? r.qty_base_per_unit : 1;
    const available = balance > 0 ? Math.floor(balance / qtyBase) : 0;
    result[r.product_id] = {
      availableUnits: available,
      stockItemId: r.stock_item_id,
      stockItemName: r.stock_name,
      unitType: (r.unit_type as StockUnitType) || 'piece',
      displayUnit: r.display_unit || 'piece',
      balanceBase: balance,
    };
  }
  return result;
}

/** Recipes with production history cannot be deleted. */
export async function deleteRecipe(id: string): Promise<void> {
  const db = await getStockDb();
  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM production_batches WHERE recipe_id = ?',
    id,
  );
  if ((countRow?.count ?? 0) > 0) {
    throw new Error('This recipe has production history and cannot be deleted.');
  }
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ finished_item_id: string }>(
      'SELECT finished_item_id FROM recipes WHERE id = ?',
      id,
    );
    await db.runAsync('DELETE FROM recipe_items WHERE recipe_id = ?', id);
    await db.runAsync('DELETE FROM recipes WHERE id = ?', id);
    if (row?.finished_item_id) {
      // The finished stock item now belongs to a product (product_stock_links),
      // so keep it and its history when the recipe is removed.
      const link = await db.getFirstAsync<{ product_id: string }>(
        'SELECT product_id FROM product_stock_links WHERE stock_item_id = ? LIMIT 1',
        row.finished_item_id,
      );
      if (!link) {
        await db.runAsync('DELETE FROM product_stock_links WHERE stock_item_id = ?', row.finished_item_id);
        await db.runAsync('DELETE FROM stock_items WHERE id = ?', row.finished_item_id);
      }
    }
  });
}

// ─── Production ────────────────────────────────────────────────────────────

export interface RequirementRow {
  stockItemId: string;
  name: string;
  unitType: StockUnitType;
  displayUnit: string;
  requiredBase: number;
  availableBase: number;
  afterBase: number;
  shortfallBase: number;
}

export interface ProductionPlan {
  recipe: Recipe;
  quantity: number;
  rows: RequirementRow[];
  hasShortage: boolean;
  /** Most units that can be produced with the current stock (Infinity when free). */
  maxProducible: number;
}

/** Builds the material consumption summary for a planned production run. */
export async function computeProductionPlan(recipeId: string, quantity: number): Promise<ProductionPlan | null> {
  const db = await getStockDb();
  const recipe = await loadRecipe(db, recipeId);
  if (!recipe) return null;

  const rows: RequirementRow[] = [];
  let maxProducible = Infinity;
  for (const line of recipe.items) {
    const item = await db.getFirstAsync<StockItemRow>(
      `SELECT i.*, COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = i.id), 0) AS balance
         FROM stock_items i WHERE i.id = ?`,
      line.stockItemId,
    );
    const unitType = (item?.unit_type as StockUnitType) ?? 'piece';
    const available = item?.balance ?? 0;
    const required = Math.round(line.qtyPerUnitBase * quantity * 10000) / 10000;
    rows.push({
      stockItemId: line.stockItemId,
      name: item?.name ?? 'Deleted stock item',
      unitType,
      displayUnit: item?.display_unit ?? (unitType === 'weight' ? 'g' : 'piece'),
      requiredBase: required,
      availableBase: available,
      afterBase: available - required,
      shortfallBase: Math.max(0, required - available),
    });
    if (line.qtyPerUnitBase > 0) {
      maxProducible = Math.min(maxProducible, Math.floor(available / line.qtyPerUnitBase));
    }
  }
  return {
    recipe,
    quantity,
    rows,
    hasShortage: rows.some((r) => r.shortfallBase > 0),
    maxProducible,
  };
}

export interface CreateBatchResult {
  ok: boolean;
  batch?: ProductionBatch;
  shortages?: Array<{ name: string; shortfallBase: number; unitType: StockUnitType }>;
}

/**
 * Confirms one production batch: deducts every ingredient, adds the
 * finished quantity and saves the batch record with a frozen recipe
 * snapshot — all inside a single SQLite transaction. Refuses (and changes
 * nothing) when any material is short.
 */
export async function createProductionBatch(
  recipeId: string,
  quantity: number,
  notes?: string,
  createdAtMs?: number,
): Promise<CreateBatchResult> {
  const db = await getStockDb();
  let result: CreateBatchResult | undefined;
  await db.withTransactionAsync(async () => {
    result = await buildProductionBatch(db, recipeId, quantity, notes, createdAtMs);
  });
  if (!result) throw new Error('Could not record the production batch.');
  return result;
}

/** Runs inside the caller's transaction; never touches stock when short. */
async function buildProductionBatch(
  db: SQLiteDatabase,
  recipeId: string,
  quantity: number,
  notes?: string,
  createdAtMs?: number,
): Promise<CreateBatchResult> {
  const recipe = await loadRecipe(db, recipeId);
  if (!recipe) throw new Error('Recipe not found.');
  if (quantity <= 0) throw new Error('Production quantity must be greater than zero.');
  const createdAt = createdAtMs ?? Date.now();

  const shortages: Array<{ name: string; shortfallBase: number; unitType: StockUnitType }> = [];
  const snapshot: ProductionBatch['snapshot'] = [];
  for (const line of recipe.items) {
    const item = await db.getFirstAsync<StockItemRow>(
      `SELECT i.*, COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = i.id), 0) AS balance
         FROM stock_items i WHERE i.id = ?`,
      line.stockItemId,
    );
    const required = Math.round(line.qtyPerUnitBase * quantity * 10000) / 10000;
    const available = item?.balance ?? 0;
    if (required > 0 && available < required) {
      shortages.push({
        name: item?.name ?? 'Deleted stock item',
        shortfallBase: required - available,
        unitType: (item?.unit_type as StockUnitType) ?? 'piece',
      });
    }
    snapshot.push({
      stockItemId: line.stockItemId,
      name: item?.name ?? 'Deleted stock item',
      qtyPerUnitBase: line.qtyPerUnitBase,
      usedBase: required,
      unitType: (item?.unit_type as StockUnitType) ?? 'piece',
      unitLabel: item?.display_unit || (item?.unit_type === 'weight' ? 'g' : 'piece'),
    });
  }
  if (shortages.length > 0) {
    return { ok: false, shortages };
  }

    const counterRow = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM stock_meta WHERE key = 'batch_counter'`,
    );
    const lastBatch = Number.parseInt(counterRow?.value ?? '0', 10) || 0;
    const nextBatch = lastBatch + 1;
    const batchNo = `PR-${String(nextBatch).padStart(4, '0')}`;
    if (counterRow) {
      await db.runAsync(`UPDATE stock_meta SET value = ? WHERE key = 'batch_counter'`, [
        String(nextBatch),
      ]);
    } else {
      await db.runAsync(`INSERT INTO stock_meta (key, value) VALUES ('batch_counter', ?)`, [
        String(nextBatch),
      ]);
    }

    for (const line of snapshot) {
      if (line.usedBase > 0) {
        await insertTxn(db, {
          itemId: line.stockItemId,
          type: 'production_use',
          qtyChange: -line.usedBase,
          refType: 'batch',
          refId: batchNo,
          note: `Used to produce ${quantity} × ${recipe.name}`,
          createdAtMs: createdAt,
        });
      }
    }

    const isKg = recipe.finishedUnit.trim().toLowerCase() === 'kg';
    const finishedQtyBase = isKg
      ? Math.round(quantity * 1000 * 10000) / 10000
      : Math.round(quantity * 10000) / 10000;
    await insertTxn(db, {
      itemId: recipe.finishedItemId,
      type: 'production_out',
      qtyChange: finishedQtyBase,
      refType: 'batch',
      refId: batchNo,
      note: `Produced ${quantity} ${recipe.finishedUnit || 'pcs'} of ${recipe.name}`,
      createdAtMs: createdAt,
    });

    const batch: ProductionBatch = {
      id: makeId(),
      batchNo,
      recipeId: recipe.id,
      recipeName: recipe.name,
      finishedUnit: recipe.finishedUnit,
      quantity,
      finishedQtyBase,
      finishedItemId: recipe.finishedItemId,
      snapshot,
      notes: notes?.trim() || undefined,
      createdAtMs: createdAt,
    };
    await db.runAsync(
      `INSERT INTO production_batches
         (id, batch_no, recipe_id, recipe_name, finished_unit, quantity, finished_qty_base, finished_item_id, snapshot_json, notes, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batch.id,
        batch.batchNo,
        batch.recipeId,
        batch.recipeName,
        batch.finishedUnit,
        batch.quantity,
        batch.finishedQtyBase,
        batch.finishedItemId,
        JSON.stringify(batch.snapshot),
        batch.notes ?? null,
        batch.createdAtMs,
      ],
    );
    return { ok: true, batch };
}

export async function getProductionBatches(): Promise<ProductionBatch[]> {
  const db = await getStockDb();
  const rows = await db.getAllAsync<BatchRow>(
    'SELECT * FROM production_batches ORDER BY created_at_ms DESC',
  );
  return rows.map(rowToBatch);
}

export async function getProductionBatch(batchNo: string): Promise<ProductionBatch | null> {
  const db = await getStockDb();
  const row = await db.getFirstAsync<BatchRow>(
    'SELECT * FROM production_batches WHERE batch_no = ?',
    batchNo,
  );
  return row ? rowToBatch(row) : null;
}

export interface ProductionSummary {
  batchCount: number;
  unitsProduced: number;
  recipeCount: number;
}

export async function getProductionSummary(): Promise<ProductionSummary> {
  const db = await getStockDb();
  const row = await db.getFirstAsync<{ batches: number; units: number | null }>(
    'SELECT COUNT(*) AS batches, SUM(quantity) AS units FROM production_batches',
  );
  const recipeRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM recipes',
  );
  return {
    batchCount: row?.batches ?? 0,
    unitsProduced: row?.units ?? 0,
    recipeCount: recipeRow?.count ?? 0,
  };
}

export interface FinishedGoodsRow {
  recipe: Recipe;
  item: StockItem;
  producedBase: number;
  soldBase: number;
  status: StockStatus;
}

/** Finished-goods inventory per recipe: produced, sold and available. */
export async function getFinishedGoods(): Promise<FinishedGoodsRow[]> {
  const db = await getStockDb();
  const recipes = await getRecipes();
  const rows: FinishedGoodsRow[] = [];
  for (const recipe of recipes) {
    const row = await db.getFirstAsync<{
      balance: number | null;
      produced: number | null;
      sold: number | null;
      name: string;
      category: string;
      min_qty_base: number;
      created_at_ms: number;
      display_unit: string;
    }>(
      `SELECT
         COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = ?), 0) AS balance,
         COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = ? AND t.type = 'production_out'), 0) AS produced,
         COALESCE((SELECT SUM(-t.qty_change) FROM stock_transactions t WHERE t.item_id = ? AND t.type IN ('sale', 'sale_reversal')), 0) AS sold,
         name, category, min_qty_base, created_at_ms, display_unit
       FROM stock_items WHERE id = ?`,
      recipe.finishedItemId,
      recipe.finishedItemId,
      recipe.finishedItemId,
      recipe.finishedItemId,
    );
    rows.push({
      recipe,
      item: {
        id: recipe.finishedItemId,
        name: row?.name ?? recipe.name,
        category: row?.category ?? 'Finished Goods',
        kind: 'finished',
        unitType: recipe.finishedUnit.trim().toLowerCase() === 'kg' ? 'weight' : 'piece',
        displayUnit: (row?.display_unit as StockDisplayUnit) || (recipe.finishedUnit.trim().toLowerCase() === 'kg' ? 'kg' : recipe.finishedUnit || 'piece'),
        minQtyBase: row?.min_qty_base ?? 0,
        createdAtMs: row?.created_at_ms ?? recipe.createdAtMs,
        balance: row?.balance ?? 0,
      },
      producedBase: row?.produced ?? 0,
      soldBase: row?.sold ?? 0,
      status: stockStatus(row?.balance ?? 0, row?.min_qty_base ?? 0),
    });
  }
  return rows;
}

// ─── Billing product ↔ stock links ─────────────────────────────────────────

export async function getProductLinks(): Promise<Record<string, ProductStockLink>> {
  const db = await getStockDb();
  const rows = await db.getAllAsync<{ product_id: string; stock_item_id: string; qty_base_per_unit: number }>(
    `SELECT l.product_id, l.stock_item_id, l.qty_base_per_unit
       FROM product_stock_links l
       JOIN stock_items s ON s.id = l.stock_item_id`,
  );
  const map: Record<string, ProductStockLink> = {};
  for (const row of rows) {
    map[row.product_id] = {
      productId: row.product_id,
      stockItemId: row.stock_item_id,
      qtyBasePerUnit: row.qty_base_per_unit,
    };
  }
  return map;
}

export async function setProductLink(link: ProductStockLink): Promise<void> {
  const db = await getStockDb();
  await db.runAsync(
    `INSERT INTO product_stock_links (product_id, stock_item_id, qty_base_per_unit, created_at_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       stock_item_id = excluded.stock_item_id,
       qty_base_per_unit = excluded.qty_base_per_unit`,
    [link.productId, link.stockItemId, Math.round(link.qtyBasePerUnit), Date.now()],
  );
}

export async function deleteProductLink(productId: string): Promise<void> {
  const db = await getStockDb();
  await db.runAsync('DELETE FROM product_stock_links WHERE product_id = ?', productId);
}

// ─── Billing integration ───────────────────────────────────────────────────

export interface StockShortfall {
  name: string;
  unitType: StockUnitType;
  requiredBase: number;
  availableBase: number;
}

interface LinkRow {
  product_id: string;
  stock_item_id: string;
  qty_base_per_unit: number;
  unit_type: string;
}

async function getLinksForProducts(
  db: SQLiteDatabase,
  productIds: string[],
): Promise<LinkRow[]> {
  if (productIds.length === 0) return [];
  const placeholders = productIds.map(() => '?').join(', ');
  return db.getAllAsync<LinkRow>(
    `SELECT l.product_id, l.stock_item_id, l.qty_base_per_unit, s.unit_type
       FROM product_stock_links l
       JOIN stock_items s ON s.id = l.stock_item_id
      WHERE l.product_id IN (${placeholders})`,
    productIds,
  );
}

/**
 * Pre-check before a bill is generated/saved: the stock each linked product
 * needs versus what is on hand. Returns [] (and changes nothing) when no
 * product in the sale is linked to stock — unlinked billing is untouched.
 */
export async function checkSaleStock(
  items: Array<Pick<CartItem, 'productId' | 'quantity'>>,
  excludeBillNumber?: string,
): Promise<StockShortfall[]> {
  const db = await getStockDb();
  const links = await getLinksForProducts(
    db,
    items.map((it) => it.productId),
  );
  if (links.length === 0) return [];

  const requiredPerItem = new Map<string, { base: number; name: string; unitType: StockUnitType }>();
  const names = new Map(links.map((l) => [l.product_id, l]));
  for (const item of items) {
    const link = names.get(item.productId);
    if (!link) continue;
    const need = Math.round(link.qty_base_per_unit * item.quantity);
    const entry = requiredPerItem.get(link.stock_item_id) ?? {
      base: 0,
      name: '',
      unitType: (link.unit_type as StockUnitType) ?? 'piece',
    };
    const merged = { ...entry, base: entry.base + need };
    requiredPerItem.set(link.stock_item_id, merged);
  }

  const shortfalls: StockShortfall[] = [];
  for (const [itemId, required] of requiredPerItem) {
    if (required.base <= 0) continue;
    const itemRow = await db.getFirstAsync<StockItemRow>(
      `SELECT i.*, COALESCE((SELECT SUM(t.qty_change) FROM stock_transactions t WHERE t.item_id = i.id), 0) AS balance
         FROM stock_items i WHERE i.id = ?`,
      itemId,
    );
    if (!itemRow) continue;
    let available = itemRow.balance ?? 0;
    if (excludeBillNumber) {
      const billRow = await db.getFirstAsync<{ total: number | null }>(
        `SELECT SUM(qty_change) AS total FROM stock_transactions
          WHERE ref_type = 'bill' AND ref_id = ? AND item_id = ? AND type IN ('sale', 'sale_reversal')`,
        excludeBillNumber,
        itemId,
      );
      available -= billRow?.total ?? 0;
    }
    if (required.base > available) {
      shortfalls.push({
        name: itemRow.name,
        unitType: (itemRow.unit_type as StockUnitType) ?? 'piece',
        requiredBase: required.base,
        availableBase: available,
      });
    }
  }
  return shortfalls;
}

/**
 * Keeps the stock ledger in step with a bill — idempotent and delta-based.
 * Called after a bill is saved (new or edited) and with no items when a
 * bill is deleted, so:
 *   - saving the same bill again never deducts twice,
 *   - editing quantities adjusts the difference,
 *   - deleting reverses the deduction with its own ledger row.
 */
export async function settleBillStockForInvoice(
  billNumber: string,
  items: Array<Pick<CartItem, 'productId' | 'quantity'>>,
): Promise<void> {
  const db = await getStockDb();
  const links = await getLinksForProducts(
    db,
    items.map((it) => it.productId),
  );
  if (links.length === 0) return;
  const linkMap = new Map(links.map((l) => [l.product_id, l]));

  await db.withTransactionAsync(async () => {
    const currentRows = await db.getAllAsync<{ item_id: string; total: number }>(
      `SELECT item_id, SUM(qty_change) AS total FROM stock_transactions
        WHERE ref_type = 'bill' AND ref_id = ? AND type IN ('sale', 'sale_reversal')
        GROUP BY item_id`,
      billNumber,
    );
    const current = new Map(currentRows.map((r) => [r.item_id, r.total]));

    const desired = new Map<string, number>();
    for (const item of items) {
      const link = linkMap.get(item.productId);
      if (!link) continue;
      const need = Math.round(link.qty_base_per_unit * item.quantity);
      desired.set(link.stock_item_id, (desired.get(link.stock_item_id) ?? 0) - need);
    }

    const allIds = new Set<string>([...current.keys(), ...desired.keys()]);
    for (const itemId of allIds) {
      const cur = current.get(itemId) ?? 0;
      const des = desired.get(itemId) ?? 0;
      const delta = des - cur;
      if (delta === 0) continue;
      await insertTxn(db, {
        itemId,
        type: delta < 0 ? 'sale' : 'sale_reversal',
        qtyChange: delta,
        refType: 'bill',
        refId: billNumber,
        note: delta < 0 ? `Sold on bill ${billNumber}` : `Reversed for bill ${billNumber}`,
      });
    }
  });
}

/** Reverses every stock deduction a bill made (used on bill deletion). */
export async function reverseBillStock(billNumber: string): Promise<void> {
  await settleBillStockForInvoice(billNumber, []);
}
