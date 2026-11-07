/**
 * Referral tab — identical layout to Home but EVERY price is displayed and
 * charged as getReferralPrice(base) = round2(base * 1.10), and it uses the
 * completely separate REFERRAL cart.
 *
 * Before the products appear the owner must type the referral ID of the
 * partner this sale belongs to. A valid ID unlocks the flow, shows the
 * partner's name, and credits 10% of every bill to that partner.
 */

import { router } from 'expo-router';
import React from 'react';
import { addReferralProduct, useReferralCart } from '../../store/referralCartStore';
import { useProductStore } from '../../store/productStore';
import { useReferralSession } from '../../store/referralSession';
import { ProductListScreen } from '../../components/ProductListScreen';
import { ReferralIdScreen } from '../../components/ReferralIdScreen';
import { showToast } from '../../components/Toast';

export default function ReferralTab() {
  const products = useProductStore((s) => s.products);
  const items = useReferralCart((s) => s.items);
  const active = useReferralSession((s) => s.active);
  const { setQuantity, increment, decrement } = useReferralCart.getState();

  if (!active) {
    return (
      <ReferralIdScreen
        onClose={() => router.replace('/(tabs)')}
        onActivated={(owner) => {
          useReferralSession.getState().setActive(owner);
          showToast(`Referral: ${owner.name}`);
        }}
      />
    );
  }

  return (
    <ProductListScreen
      flow="referral"
      products={products}
      items={items}
      referralName={active.name}
      onChangeReferral={() => {
        useReferralSession.getState().clearActive();
        showToast('Enter another referral ID');
      }}
      addProduct={(product, quantity) => {
        addReferralProduct(product, quantity);
        showToast(`Added to ${active.name}'s referral cart`);
      }}
      setQuantity={setQuantity}
      increment={increment}
      decrement={decrement}
    />
  );
}
