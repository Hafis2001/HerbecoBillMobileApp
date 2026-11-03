/**
 * Referral tab — identical layout to Home but EVERY price is displayed and
 * charged as getReferralPrice(base) = round2(base * 1.10), and it uses the
 * completely separate REFERRAL cart.
 */

import React from 'react';
import { addReferralProduct, useReferralCart } from '../../store/referralCartStore';
import { useProductStore } from '../../store/productStore';
import { ProductListScreen } from '../../components/ProductListScreen';
import { showToast } from '../../components/Toast';

export default function ReferralTab() {
  const products = useProductStore((s) => s.products);
  const items = useReferralCart((s) => s.items);
  const { setQuantity, increment, decrement } = useReferralCart.getState();

  return (
    <ProductListScreen
      flow="referral"
      products={products}
      items={items}
      addProduct={(product, quantity) => {
        addReferralProduct(product, quantity);
        showToast('Added to referral cart');
      }}
      setQuantity={setQuantity}
      increment={increment}
      decrement={decrement}
    />
  );
}
