/**
 * HERBECO — shared domain types.
 * All money values are stored as plain numbers and must go through
 * utils/pricing.ts helpers so the rounding stays consistent app-wide.
 */

/** How a product is sold. */
export type Unit = 'kg' | 'unit';

/** Which sales flow a cart / bill belongs to. */
export type CartType = 'home' | 'referral';

/** A product in the owner's catalogue. */
export interface Product {
  id: string;
  name: string;
  unit: Unit;
  /** Price per kg (or per piece for "unit"). Always > 0. */
  price: number;
  /** Local persisted image URI (documentDirectory) or undefined if no photo. */
  imageUri?: string;
  createdAt: number;
}

/** A single line in a cart or on an invoice. */
export interface CartItem {
  productId: string;
  name: string;
  unit: Unit;
  /** Price shown/charged for this flow — already includes the referral markup. */
  unitPrice: number;
  /** 0.5 allowed for kg; whole numbers for unit. */
  quantity: number;
  imageUri?: string;
}

/** Customer details required before a bill can be generated. */
export interface Customer {
  name: string;
  /** 10-digit Indian mobile number, digits only. */
  phone: string;
}

/** Generated tax invoice. */
export interface Invoice {
  number: string; // e.g. "HB-0001"
  type: CartType;
  customer: Customer;
  items: CartItem[];
  subtotal: number;
  /** Flat discount (₹) taken off the subtotal before GST. 0 when none. */
  discount?: number;
  gst: number;
  grandTotal: number;
  createdAt: string; // ISO date-time
  /** Referral partner credited with this sale (referral flow only). */
  referral?: ReferralRef;
}

/** Minimal referral info carried on a bill. */
export interface ReferralRef {
  /** The referral ID typed at the referral gate (upper case). */
  code: string;
  name: string;
}

/** Customer form values (strings, as typed in the form). */
export interface CustomerFormValues {
  name: string;
  phone: string;
}

/** Upload status of a saved bill (Bills tab). */
export type InvoiceStatus = 'pending' | 'uploaded';

/** A saved bill in the local SQLite database (kept until deleted by hand). */
export interface InvoiceRecord {
  id: string;
  number: string;
  type: CartType;
  customerName: string;
  customerPhone: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  gst: number;
  grandTotal: number;
  /** Milliseconds epoch — used for the date filters and dashboard. */
  createdAtMs: number;
  status: InvoiceStatus;
  /** Milliseconds epoch, only set once marked uploaded. */
  uploadedAtMs: number | null;
  /** Referral partner credited with this bill, when it was a referral sale. */
  referralCode: string | null;
  referralName: string | null;
  /** True once the partner's 10% on this bill has been handed over. */
  commissionPaid: boolean;
  /** Milliseconds epoch of the payment, only set with `commissionPaid`. */
  commissionPaidAtMs: number | null;
}

/** A referral partner saved in Settings → Referrals. */
export interface ReferralOwner {
  /** Referral ID the owner types at the referral gate, e.g. "RAJU01". */
  code: string;
  name: string;
  /** 10-digit Indian mobile number, digits only. */
  phone: string;
  createdAtMs: number;
}

/** Totals collected for one referral partner. */
export interface ReferralStat {
  bills: number;
  sales: number;
  /** 10% of every referral bill, added bill by bill. */
  earned: number;
  /** Part of `earned` already marked paid. */
  paid: number;
  /** Part of `earned` still to be paid (`earned - paid`). */
  pending: number;
}

/** One commission line on a partner's detail page: 10% of a single bill. */
export interface ReferralCommissionLine {
  /** Invoice id (= bill number). */
  id: string;
  number: string;
  /** When the customer bought — the bill's date. */
  purchaseMs: number;
  /** The bill's grand total. */
  billAmount: number;
  /** 10% of `billAmount`. */
  commission: number;
  paid: boolean;
  paidAtMs: number | null;
}
