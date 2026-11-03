/**
 * Product card in the 2-column grid. Shows the flow price (base or +10%
 * referral, with the original struck through for referral) and switches
 * between an "Add" pill and a quantity stepper once the item is in the cart.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatPriceWithUnit } from '../utils/format';
import { getReferralPrice } from '../utils/pricing';
import type { Product } from '../types';
import ProductImage from './ProductImage';
import QuantitySelector from './QuantitySelector';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface ProductCardProps {
  product: Product;
  /** "home" shows the base price; "referral" shows +10% with strikethrough. */
  flow: 'home' | 'referral';
  quantityInCart: number;
  onAdd: () => void;
  /** Stepper callback; call onAdd() again or setQuantity depending on flow. */
  onQuantityChange: (quantity: number) => void;
  onRemoveFromCart: () => void;
  /** Opens the gram / ₹-amount entry sheet (weight products only). */
  onEditQuantity?: () => void;
}

export function ProductCard({
  product,
  flow,
  quantityInCart,
  onAdd,
  onQuantityChange,
  onRemoveFromCart,
  onEditQuantity,
}: ProductCardProps) {
  const isReferral = flow === 'referral';
  const flowPrice = isReferral ? getReferralPrice(product.price) : product.price;

  return (
    <View style={styles.card}>
      <ProductImage uri={product.imageUri} style={styles.image} />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        {isReferral ? (
          <View style={styles.priceBlock}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Referral +10%</Text>
            </View>
            <Text style={styles.oldPrice}>{formatPriceWithUnit(product.price, product.unit)}</Text>
          </View>
        ) : null}

        <Text
          style={[
            styles.price,
            isReferral && styles.referralPrice,
          ]}
        >
          {formatPriceWithUnit(flowPrice, product.unit)}
        </Text>
      </View>

      <View style={styles.footer}>
        {quantityInCart > 0 ? (
          <QuantitySelector
            size="sm"
            unit={product.unit}
            quantity={quantityInCart}
            onChange={onQuantityChange}
            onRemove={onRemoveFromCart}
            onPressValue={product.unit === 'kg' ? onEditQuantity : undefined}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name}`}
            onPress={onAdd}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.addText}>+ Add</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    margin: spacing.sm / 2,
    overflow: 'hidden',
    ...cardShadow,
  },
  image: {
    width: '100%',
    aspectRatio: 1.15,
  },
  body: {
    paddingHorizontal: spacing.md - 2,
    paddingTop: spacing.sm + 2,
  },
  name: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 36,
  },
  priceBlock: {
    marginTop: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.gold,
  },
  oldPrice: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    marginTop: 3,
  },
  price: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  referralPrice: {
    color: colors.gold,
  },
  footer: {
    paddingHorizontal: spacing.md - 2,
    paddingBottom: spacing.sm + 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: colors.textOnPrimary,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
  },
});

export default ProductCard;
