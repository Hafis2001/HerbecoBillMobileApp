/**
 * Home tab — normal price sales flow, uses the separate HOME cart only.
 */

import React from 'react';
import { useHomeCart, addHomeProduct } from '../../store/homeCartStore';
import { useProductStore } from '../../store/productStore';
import { ProductListScreen } from '../../components/ProductListScreen';
import { showToast } from '../../components/Toast';

export default function HomeTab() {
  const products = useProductStore((s) => s.products);
  const items = useHomeCart((s) => s.items);
  const { setQuantity, increment, decrement } = useHomeCart.getState();

  return (
    <ProductListScreen
      flow="home"
      products={products}
      items={items}
      addProduct={(product, quantity) => {
        addHomeProduct(product, quantity);
        showToast('Added to cart');
      }}
      setQuantity={setQuantity}
      increment={increment}
      decrement={decrement}
    />
  );
}
