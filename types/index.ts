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
  /** Payment method chosen at billing: cash, bank or split. */
  paymentMethod?: PaymentMethod;
  bankAmount?: number;
  cashAmount?: number;
  paymentConfirmed?: boolean;
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
  /** Payment method used: cash, bank (UPI) or split. Null for older bills. */
  paymentMethod: 'cash' | 'bank' | 'split' | null;
  /** Amount paid via bank/UPI. 0 or null for cash-only bills. */
  bankAmount: number;
  /** Amount paid in cash. 0 or null for bank-only bills. */
  cashAmount: number;
  /** True once cashier confirmed payment was received. */
  paymentConfirmed: boolean;
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

/** How the customer paid for a bill. */
export type PaymentMethod = 'cash' | 'bank' | 'split';

/** Payment details recorded with a bill. */
export interface BillPayment {
  method: PaymentMethod;
  /** Amount paid via UPI/bank. 0 for cash-only. */
  bankAmount: number;
  /** Amount paid in cash. 0 for bank-only. */
  cashAmount: number;
  /** True once the cashier confirmed payment received. */
  confirmed: boolean;
}

/** An expense entry saved by the owner. */
export interface Expense {
  id: string;
  description: string;
  amount: number;
  /** Whether the expense was paid from cash on hand or via bank/UPI. */
  paidVia: 'cash' | 'bank';
  createdAtMs: number;
  /** Optional category label. */
  category?: string;
}

/** ─── Stock & Production ─────────────────────────────────────────────────── */

/** How a stock item is measured. */
export type StockUnitType = 'weight' | 'volume' | 'piece';

/** Unit the owner types quantities in; stored internally as g / ml / pc. */
export type StockDisplayUnit =
  | 'kg'
  | 'g'
  | 'l'
  | 'ml'
  | 'pc'
  | 'piece'
  | 'bottle'
  | 'packet'
  | 'box'
  | string;

/** Raw material for production/purchases vs finished good produced in-house. */
export type StockKind = 'material' | 'finished';

/** In Stock / Low Stock / Out of Stock. */
export type StockStatus = 'in' | 'low' | 'out';

/** One stock item in Settings → Stock Management. */
export interface StockItem {
  id: string;
  name: string;
  category: string;
  kind: StockKind;
  unitType: StockUnitType;
  displayUnit: StockDisplayUnit;
  /** Minimum alert level, in base units (g / ml / pc). */
  minQtyBase: number;
  /** Purchase price per display unit, when known. */
  purchasePrice?: number;
  notes?: string;
  /** Set for finished goods — the recipe this item is produced by. */
  recipeId?: string;
  createdAtMs: number;
  /** Current balance in base units (sum of the ledger). */
  balance: number;
}

/** Every stock change recorded in the ledger. */
export type StockTransactionType =
  | 'opening'
  | 'restock'
  | 'adjust'
  | 'production_use'
  | 'production_out'
  | 'sale'
  | 'sale_reversal';

/** One ledger row: the reason, the quantity and the resulting balance. */
export interface StockTransaction {
  id: string;
  itemId: string;
  type: StockTransactionType;
  /** Signed change in base units (negative = stock consumed). */
  qtyChange: number;
  balanceAfter: number;
  /** Bill number or production batch number this row belongs to. */
  refType?: 'bill' | 'batch' | null;
  refId?: string | null;
  note?: string;
  /** Purchase price captured at restock time, per display unit. */
  unitPrice?: number;
  supplier?: string;
  createdAtMs: number;
}

/** One ingredient line of a production recipe. */
export interface RecipeItemLine {
  id: string;
  recipeId: string;
  stockItemId: string;
  /** Base units (g / ml / pc) consumed per ONE finished unit. */
  qtyPerUnitBase: number;
}

/** A production product and the recipe that makes it. */
export interface Recipe {
  id: string;
  name: string;
  imageUri?: string;
  /** Selling rate / price per finished unit. */
  price: number;
  /** How the finished product is counted: pieces, bottles, packets, boxes, kg, etc. */
  finishedUnit: string;
  notes?: string;
  /** Finished-goods stock item produced by this recipe. */
  finishedItemId: string;
  /** Associated billing catalogue product ID (if synced). */
  productId?: string;
  createdAtMs: number;
  updatedAtMs: number;
  /** Ingredient lines (always loaded with the recipe). */
  items: RecipeItemLine[];
}

/** One completed production batch. */
export interface ProductionBatch {
  id: string;
  batchNo: string;
  recipeId: string;
  recipeName: string;
  finishedUnit: string;
  /** Finished units produced (pieces, bottles, packets, boxes, or kg). */
  quantity: number;
  finishedQtyBase: number;
  finishedItemId: string;
  /** Ingredient quantities used at production time — frozen forever. */
  snapshot: Array<{
    stockItemId: string;
    name: string;
    qtyPerUnitBase: number;
    usedBase: number;
    unitType: StockUnitType;
    unitLabel?: string;
  }>;
  notes?: string;
  createdAtMs: number;
}

/** Connects a billing catalogue product to a stock item for sales deduction. */
export interface ProductStockLink {
  productId: string;
  stockItemId: string;
  /** Base units consumed per one unit sold of the billing product. */
  qtyBasePerUnit: number;
}
