/**
 * Cart store factory — used to build two completely independent cart stores
 * (homeCartStore and referralCartStore). Each store gets its own slice of
 * state and its own AsyncStorage key, so carts can never mix.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create, type UseBoundStore, type StoreApi } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartItem, Product } from '../types';

interface CartState {
  items: CartItem[];
  /** Flat discount (₹) applied to this cart only; reset when the cart clears. */
  discount: number;
  setDiscount: (amount: number) => void;
  /** Adds `quantity` units of `product` at the FINAL unit price for this flow. */
  addToCart: (product: Product, quantity: number, unitPrice: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  /** Increments by `step`; keeps 0.5 precision for kg. */
  increment: (productId: string, step?: number) => void;
  /** Decrements by `step`; removes the line when it reaches 0. */
  decrement: (productId: string, step?: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

export type CartStore = UseBoundStore<StoreApi<CartState>>;

/**
 * Avoids 0.10000000000000001 style drift for kg quantities.
 * 3 decimals = 1 gram, so typed weights like 150 g survive as 0.15 kg.
 */
export function fixPrecision(qty: number): number {
  return Math.round((qty + Number.EPSILON) * 1000) / 1000;
}

export function createCartStore(storageKey: string): CartStore {
  return create<CartState>()(
    persist(
      (set) => ({
        items: [],
        discount: 0,

        /** Stores a 2-decimal discount; negative input is treated as 0. */
        setDiscount: (amount) =>
          set({ discount: Math.max(0, Math.round((amount || 0) * 100) / 100) }),

        addToCart: (product, quantity, unitPrice) =>
          set((state) => {
            const existing = state.items.find((it) => it.productId === product.id);
            if (existing) {
              return {
                items: state.items.map((it) =>
                  it.productId === product.id
                    ? { ...it, quantity: fixPrecision(it.quantity + quantity) }
                    : it,
                ),
              };
            }
            const line: CartItem = {
              productId: product.id,
              name: product.name,
              unit: product.unit,
              quantity: fixPrecision(quantity),
              imageUri: product.imageUri,
              unitPrice,
            };
            return { items: [...state.items, line] };
          }),

        setQuantity: (productId, quantity) =>
          set((state) => ({
            items:
              quantity <= 0
                ? state.items.filter((it) => it.productId !== productId)
                : state.items.map((it) =>
                    it.productId === productId ? { ...it, quantity: fixPrecision(quantity) } : it,
                  ),
          })),

        increment: (productId, step = 1) =>
          set((state) => ({
            items: state.items.map((it) =>
              it.productId === productId
                ? { ...it, quantity: fixPrecision(it.quantity + step) }
                : it,
            ),
          })),

        decrement: (productId, step = 1) =>
          set((state) => ({
            items: state.items.flatMap((it) => {
              if (it.productId !== productId) return [it];
              const next = fixPrecision(it.quantity - step);
              return next <= 0 ? [] : [{ ...it, quantity: next }];
            }),
          })),

        removeItem: (productId) =>
          set((state) => ({ items: state.items.filter((it) => it.productId !== productId) })),

        clearCart: () => set({ items: [], discount: 0 }),
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => AsyncStorage),
      },
    ),
  );
}
