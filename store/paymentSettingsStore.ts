/**
 * Payment settings store — persisted to AsyncStorage.
 * Stores the merchant's UPI ID, merchant name and optional static QR image URI.
 * All QR generation is done offline from these stored values.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PaymentSettings {
  /** UPI VPA, e.g. "merchant@upi" */
  upiId: string;
  /** Display name shown on QR and payment screen */
  merchantName: string;
  /** Local file URI for a static bank QR image (optional) */
  staticQrUri?: string;
}

interface PaymentSettingsState {
  settings: PaymentSettings | null;
  saveSettings: (s: PaymentSettings) => void;
  clearSettings: () => void;
}

export const usePaymentSettings = create<PaymentSettingsState>()(
  persist(
    (set) => ({
      settings: null,
      saveSettings: (s) => set({ settings: s }),
      clearSettings: () => set({ settings: null }),
    }),
    {
      name: 'herbeco-payment-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * Builds a standard UPI deep-link URI.
 * All parameters are URL-encoded so spaces and special chars in names work.
 */
export function buildUpiUri(params: {
  upiId: string;
  merchantName: string;
  amount: number;
  billNumber: string;
}): string {
  const { upiId, merchantName, amount, billNumber } = params;
  const enc = encodeURIComponent;
  return (
    `upi://pay?pa=${enc(upiId)}` +
    `&pn=${enc(merchantName)}` +
    `&am=${amount.toFixed(2)}` +
    `&cu=INR` +
    `&tn=${enc('BILL_PAYMENT')}` +
    `&tr=${enc(billNumber)}`
  );
}
