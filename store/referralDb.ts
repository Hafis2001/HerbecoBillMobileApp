/**
 * Referral partners (Settings → Referrals), stored in local SQLite.
 *
 * Each partner has a short referral ID that the owner types on the Referral
 * tab. The ID is stored upper-case so "raju01" and "RAJU01" are the same
 * partner.
 */

import type { ReferralOwner } from '../types';
import { getDatabase } from './db';

interface ReferralRow {
  code: string;
  name: string;
  phone: string;
  created_at_ms: number;
}

const rowToOwner = (row: ReferralRow): ReferralOwner => ({
  code: row.code,
  name: row.name,
  phone: row.phone,
  createdAtMs: row.created_at_ms,
});

/** " raju 01 " -> "RAJU01" — spaces removed, letters upper-cased. */
export function normalizeReferralCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** All referral partners, alphabetical by name. */
export async function getReferralOwners(): Promise<ReferralOwner[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ReferralRow>(
    'SELECT * FROM referrals ORDER BY name COLLATE NOCASE ASC',
  );
  return rows.map(rowToOwner);
}

/** Looks up one partner by ID (case/space insensitive) or returns null. */
export async function findReferralOwner(code: string): Promise<ReferralOwner | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const db = await getDatabase();
  const row = await db.getFirstAsync<ReferralRow>(
    'SELECT * FROM referrals WHERE code = ?',
    normalized,
  );
  return row ? rowToOwner(row) : null;
}

/**
 * Creates or updates a partner. Returns false when another partner already
 * uses the same ID (only possible when changing an ID via `originalCode`).
 */
export async function saveReferralOwner(
  input: { code: string; name: string; phone: string },
  originalCode?: string,
): Promise<boolean> {
  const db = await getDatabase();
  const code = normalizeReferralCode(input.code);
  const previous = originalCode ? normalizeReferralCode(originalCode) : null;

  // Adding a NEW partner must not overwrite an existing one with the same ID.
  if (previous === null) {
    const exists = await db.getFirstAsync<{ code: string }>(
      'SELECT code FROM referrals WHERE code = ?',
      code,
    );
    if (exists) return false;
  } else if (code !== previous) {
    // Renaming to an ID another partner already uses would merge their bills.
    const clash = await db.getFirstAsync<{ code: string }>(
      'SELECT code FROM referrals WHERE code = ? AND code <> ?',
      code,
      previous,
    );
    if (clash) return false;
    // Keep the bills attached to the partner when their ID is renamed.
    await db.runAsync('UPDATE invoices SET referral_code = ? WHERE referral_code = ?', code, previous);
  }

  await db.runAsync(
    `INSERT INTO referrals (code, name, phone, created_at_ms)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, phone = excluded.phone`,
    code,
    input.name.trim(),
    input.phone,
    Date.now(),
  );
  return true;
}

/** Removes a partner. Their past bills keep the referral name for history. */
export async function deleteReferralOwner(code: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM referrals WHERE code = ?', normalizeReferralCode(code));
}
