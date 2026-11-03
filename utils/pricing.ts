/**
 * ALL money / pricing math lives here.
 * Every monetary value in the app must pass through round2 so the
 * subtotal, GST and grand total stay consistent (2 decimal places).
 */

export const GST_RATE = 0.05;
export const REFERRAL_MARKUP = 0.1;

/** Round to 2 decimals without float drift (e.g. 0.53000001 -> 0.53). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Referral price = base price + 10%. */
export function getReferralPrice(basePrice: number): number {
  return round2(basePrice * (1 + REFERRAL_MARKUP));
}

/** Price for a given cart flow ("home" uses the base price as-is). */
export function getPriceForFlow(basePrice: number, type: 'home' | 'referral'): number {
  return type === 'referral' ? getReferralPrice(basePrice) : basePrice;
}

/** One invoice line: price applied per unit and quantity. */
export interface PricingLine {
  unitPrice: number;
  quantity: number;
}

export interface Totals {
  subtotal: number;
  gst: number;
  grandTotal: number;
}

/**
 * Subtotal = sum(round2(price x qty)),
 * GST (5%) = subtotal x 0.05, Grand Total = subtotal + GST.
 */
export function computeTotals(lines: PricingLine[]): Totals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + round2(line.unitPrice * line.quantity), 0),
  );
  const gst = round2(subtotal * GST_RATE);
  const grandTotal = round2(subtotal + gst);
  return { subtotal, gst, grandTotal };
}
