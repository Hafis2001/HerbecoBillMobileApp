/**
 * HOME cart — full-price sales flow.
 * Completely separate from the referral cart: its own zustand store, its own
 * AsyncStorage key ("herbeco-cart-home") and its own items. Home-cart items
 * can never appear in the referral cart and vice versa.
 */

import { createCartStore } from './cartStoreFactory';
import { getPriceForFlow } from '../utils/pricing';
import type { Product } from '../types';

export const useHomeCart = createCartStore('herbeco-cart-home');

/** Adds a product to the HOME cart at the normal (base) price. */
export function addHomeProduct(product: Product, quantity: number): void {
  const unitPrice = getPriceForFlow(product.price, 'home');
  useHomeCart.getState().addToCart(product, quantity, unitPrice);
}
