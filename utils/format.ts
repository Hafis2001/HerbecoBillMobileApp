/**
 * Formatting helpers: Indian Rupee amounts, quantities, dates and
 * "amount in words" (Indian numbering system) for invoices.
 */

import { round2 } from './pricing';

/** "₹1,250.50" — Indian thousand separators, always 2 decimals. */
export function formatINR(value: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value));
  return `₹${formatted}`;
}

/** Rupees only (no decimals) — used for the WhatsApp greeting. */
export function formatINRShort(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(
    round2(value),
  )}`;
}

/**
 * Quantity on screen and on bills. Weights under 1 kg are written in grams
 * ("150 g", "750 g"); anything 1 kg or more stays in kg ("1.25 kg").
 * Whole items are shown as "3 unit".
 */
export function formatQuantity(quantity: number, unit: 'kg' | 'unit'): string {
  if (unit === 'unit') return `${Math.round(quantity)} unit`;

  const grams = Math.round(quantity * 1000);
  if (grams < 1000) return `${grams} g`;

  // 1000 g exactly -> "1 kg"; otherwise trim to at most 3 decimals.
  const kg = grams / 1000;
  const trimmed = kg.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed} kg`;
}

/** Grams from a kg quantity (150 g -> 0.15). */
export function gramsToKg(grams: number): number {
  return Math.round((grams / 1000) * 1000) / 1000;
}

/** Kg as a whole number of grams (0.15 -> 150). */
export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000);
}

/** "₹250 / kg" or "₹40 / unit" */
export function formatPriceWithUnit(price: number, unit: 'kg' | 'unit'): string {
  return `${formatINR(price)} / ${unit}`;
}

/** "12 Nov 2026, 3:45 PM" */
export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoDate));
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 799 -> "Seven Hundred Ninety Nine" (Indian style, < 1000). */
function twoOrThreeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return (TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')).trim();
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoOrThreeDigits(n % 100)}` : ''}`;
}

/** 1234567.89 -> "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only" */
export function amountInWords(value: number): string {
  const safe = round2(Math.max(0, value));
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Rupees Zero Only';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const remainder = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoOrThreeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoOrThreeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoOrThreeDigits(thousand)} Thousand`);
  if (remainder) parts.push(twoOrThreeDigits(remainder));

  let words = parts.join(' ').replace(/\s+/g, ' ').trim();
  words = words.charAt(0).toUpperCase() + words.slice(1);

  const rupeeWord = rupees === 1 ? 'Rupee' : 'Rupees';
  let result = `${rupeeWord} ${words}`;
  if (paise > 0) result += ` and ${twoOrThreeDigits(paise)} Paise`;
  return `${result} Only`;
}
