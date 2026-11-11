/**
 * Stock measurement helpers.
 *
 * Every stock quantity is stored in a whole base unit — grams for weight,
 * millilitres for volume, pieces for counted items — so ledger maths never
 * hits floating-point drift. These helpers convert what the owner types
 * (kg, g, litre, ml, pieces, bottles, packets, boxes) to and from those base units
 * and format them back for display.
 */

import type {
  StockDisplayUnit,
  StockItem,
  StockStatus,
  StockUnitType,
} from '../types';

export const UNIT_TYPES: Array<{ key: StockUnitType; label: string; hint: string }> = [
  { key: 'weight', label: 'Weight', hint: 'kg / g' },
  { key: 'volume', label: 'Volume', hint: 'litre / ml' },
  { key: 'piece', label: 'Individual Units', hint: 'pieces, bottles, packets…' },
];

/** Measurement units the owner can pick for each unit type. */
export const DISPLAY_UNITS: Record<StockUnitType, string[]> = {
  weight: ['kg', 'g'],
  volume: ['l', 'ml'],
  piece: ['piece', 'bottle', 'packet', 'box'],
};

/** Canonical storage unit for each unit type. */
export const BASE_UNIT: Record<StockUnitType, 'g' | 'ml' | 'pc'> = {
  weight: 'g',
  volume: 'ml',
  piece: 'pc',
};

const DISPLAY_LABEL: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'litre',
  ml: 'ml',
  pc: 'pieces',
  piece: 'pieces',
  bottle: 'bottles',
  packet: 'packets',
  box: 'boxes',
};

const SINGLE_LABEL: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'litre',
  ml: 'ml',
  pc: 'piece',
  piece: 'piece',
  bottle: 'bottle',
  packet: 'packet',
  box: 'box',
};

export function displayUnitLabel(unit: string): string {
  const lower = unit.toLowerCase();
  return DISPLAY_LABEL[lower] || unit;
}

export function displayUnitSingle(unit: string): string {
  const lower = unit.toLowerCase();
  return SINGLE_LABEL[lower] || unit;
}

/** Multiplier from a display unit to its base unit (kg → 1000 g, l → 1000 ml). */
export function displayToBaseFactor(unit: string): number {
  const lower = unit.toLowerCase();
  return lower === 'kg' || lower === 'l' ? 1000 : 1;
}

/** Display-unit quantity → whole base units (rounds away float drift). */
export function toBaseQty(qty: number, unit: string): number {
  const factor = displayToBaseFactor(unit);
  return Math.round((qty + Number.EPSILON) * factor * 10000) / 10000;
}

/** Base units → display-unit quantity (2500 g → 2.5 kg). */
export function fromBaseQty(baseQty: number, unit: string): number {
  const factor = displayToBaseFactor(unit);
  return Math.round(((baseQty / factor) + Number.EPSILON) * 10000) / 10000;
}

function cleanNumber(n: number): string {
  const rounded = Math.round((n + Number.EPSILON) * 1000) / 1000;
  return Number(rounded.toFixed(3)).toString();
}

/** "2.5 kg", "500 g", "1.5 l", "40 ml", "12 pieces", "99 bottles" — smart display. */
export function formatBaseQty(
  baseQty: number,
  unitType: StockUnitType,
  displayUnit?: string,
): string {
  if (unitType === 'piece') {
    const unit = displayUnit || 'piece';
    const isSingle = Math.abs(baseQty) === 1;
    const label = isSingle ? displayUnitSingle(unit) : displayUnitLabel(unit);
    return `${cleanNumber(baseQty)} ${label}`;
  }
  const small = unitType === 'weight' ? 'g' : 'ml';
  const big = unitType === 'weight' ? 'kg' : 'l';
  if (Math.abs(baseQty) < 1000) return `${cleanNumber(baseQty)} ${small}`;
  const bigValue = baseQty / 1000;
  return `${cleanNumber(bigValue)} ${big}`;
}

/** Signed change for a ledger row, e.g. "+10 kg" / "−100 pcs". */
export function formatQtyChange(
  qtyChange: number,
  unitType: StockUnitType,
  displayUnit?: string,
): string {
  const sign = qtyChange > 0 ? '+' : qtyChange < 0 ? '−' : '';
  return `${sign}${formatBaseQty(Math.abs(qtyChange), unitType, displayUnit)}`;
}

/** "Weight · kg / g" for the form and rows. */
export function unitTypeLabel(unitType: StockUnitType): string {
  const found = UNIT_TYPES.find((t) => t.key === unitType);
  return found ? `${found.label} · ${found.hint}` : '';
}

/** In Stock / Low Stock (≤ minimum) / Out of Stock (zero or less). */
export function stockStatus(balance: number, minQtyBase: number): StockStatus {
  if (balance <= 0) return 'out';
  if (minQtyBase > 0 && balance <= minQtyBase) return 'low';
  return 'in';
}

export const STATUS_LABEL: Record<StockStatus, string> = {
  in: 'In Stock',
  low: 'Low Stock',
  out: 'Out of Stock',
};

export function stockStatusOf(item: StockItem): StockStatus {
  return stockStatus(item.balance, item.minQtyBase);
}

/** Stock value of one item, when a purchase price is set (else 0). */
export function stockItemValue(item: StockItem): number {
  if (!item.purchasePrice) return 0;
  return Math.round(((fromBaseQty(item.balance, item.displayUnit) * item.purchasePrice) + Number.EPSILON) * 100) / 100;
}

/** Digits plus a single decimal point, as text (for quantity inputs). */
export function numericText(text: string): string {
  return text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
}
