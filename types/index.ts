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
  gst: number;
  grandTotal: number;
  createdAt: string; // ISO date-time
}

/** Customer form values (strings, as typed in the form). */
export interface CustomerFormValues {
  name: string;
  phone: string;
}

/** Upload status of a saved bill (Bills tab). */
export type InvoiceStatus = 'pending' | 'uploaded';

/** A saved bill in the local SQLite database (auto-deleted after 30 days). */
export interface InvoiceRecord {
  id: string;
  number: string;
  type: CartType;
  customerName: string;
  customerPhone: string;
  items: CartItem[];
  subtotal: number;
  gst: number;
  grandTotal: number;
  /** Milliseconds epoch — used for the 30-day auto-purge. */
  createdAtMs: number;
  status: InvoiceStatus;
  /** Milliseconds epoch, only set once marked uploaded. */
  uploadedAtMs: number | null;
}
