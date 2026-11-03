/**
 * REFERRAL cart — all prices include the +10% referral markup.
 * Its own zustand store, its own AsyncStorage key ("herbeco-cart-referral")
 * and its own items; never shares state with the home cart.
 */

import { createCartStore } from './cartStoreFactory';
import { getPriceForFlow } from '../utils/pricing';
import type { Product } from '../types';

export const useReferralCart = createCartStore('herbeco-cart-referral');

/** Adds a product to the REFERRAL cart at price + 10%. */
export function addReferralProduct(product: Product, quantity: number): void {
  const unitPrice = getPriceForFlow(product.price, 'referral');
  useReferralCart.getState().addToCart(product, quantity, unitPrice);
}
