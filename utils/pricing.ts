/**
 * ALL money / pricing math lives here.
 * Every monetary value in the app must pass through round2 so the
 * subtotal, GST and grand total stay consistent (2 decimal places).
 */

export const GST_RATE = 0.05;
export const REFERRAL_MARKUP = 0.1;
/** Share of a referral bill that is credited to the referral partner. */
export const REFERRAL_COMMISSION_RATE = 0.1;

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
  /** Discount actually applied (never more than the subtotal). */
  discount: number;
  /** Subtotal after the discount — GST is charged on this. */
  taxable: number;
  gst: number;
  grandTotal: number;
}

/**
 * Subtotal = sum(round2(price x qty)).
 * A flat discount (₹) is taken off the subtotal first, then GST (5%) is
 * charged on the discounted amount: Grand Total = (subtotal - discount) + GST.
 */
export function computeTotals(lines: PricingLine[], discount = 0): Totals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + round2(line.unitPrice * line.quantity), 0),
  );
  const appliedDiscount = round2(Math.min(Math.max(discount || 0, 0), subtotal));
  const taxable = round2(subtotal - appliedDiscount);
  const gst = round2(taxable * GST_RATE);
  const grandTotal = round2(taxable + gst);
  return { subtotal, discount: appliedDiscount, taxable, gst, grandTotal };
}

/** 10% of a bill total — credited to the referral partner. */
export function referralCommission(grandTotal: number): number {
  return round2(grandTotal * REFERRAL_COMMISSION_RATE);
}
