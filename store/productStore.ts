/**
 * Product catalogue store — persisted to AsyncStorage under "herbeco-products".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Product, Unit } from '../types';

export interface ProductInput {
  name: string;
  unit: Unit;
  price: number;
  imageUri?: string;
}

interface ProductState {
  products: Product[];
  addProduct: (input: ProductInput) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
}

/** Simple unique id (no network needed — date + random). */
export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      products: [],
      addProduct: (input) =>
        set((state) => ({
          products: [
            ...state.products,
            { ...input, id: makeId(), createdAt: Date.now() } satisfies Product,
          ],
        })),
      updateProduct: (id, patch) =>
        set((state) => ({
          products: state.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deleteProduct: (id) =>
        set((state) => ({ products: state.products.filter((p) => p.id !== id) })),
    }),
    {
      name: 'herbeco-products',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
