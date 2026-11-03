/**
 * Invoice-number counter — persisted so invoice numbers keep incrementing
 * (HB-0001, HB-0002, ...) across app restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface InvoiceCounterState {
  lastNumber: number; // 1 => next invoice is HB-0002 style counting
  nextInvoiceNumber: () => string;
}

const pad = (n: number) => String(n).padStart(4, '0');

export const useInvoiceCounter = create<InvoiceCounterState>()(
  persist(
    (set, get) => ({
      lastNumber: 0,
      nextInvoiceNumber: () => {
        const n = get().lastNumber + 1;
        set({ lastNumber: n });
        return `HB-${pad(n)}`;
      },
    }),
    { name: 'herbeco-invoice-counter', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
