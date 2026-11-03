/**
 * Cart line row: photo, name, unit price, quantity stepper, line total and
 * a remove button. Used by the cart screen for both carts.
 */

import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatINR, formatPriceWithUnit, formatQuantity } from '../utils/format';
import { round2 } from '../utils/pricing';
import type { CartItem as CartItemType } from '../types';
import ProductImage from './ProductImage';
import QuantitySelector from './QuantitySelector';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface CartItemProps {
  item: CartItemType;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  /** Opens the gram / ₹-amount entry sheet (weight products only). */
  onEditQuantity?: () => void;
}

export function CartItem({ item, onQuantityChange, onRemove, onEditQuantity }: CartItemProps) {
  const lineTotal = round2(item.unitPrice * item.quantity);

  const confirmRemove = () => {
    Alert.alert('Remove item', `Remove ${item.name} from the cart?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onRemove },
    ]);
  };

  return (
    <View style={styles.row}>
      <ProductImage uri={item.imageUri} style={styles.image} iconSize={22} />

      <View style={styles.center}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.unitPrice}>{formatPriceWithUnit(item.unitPrice, item.unit)}</Text>
        <View style={styles.stepperWrap}>
          <QuantitySelector
            size="sm"
            unit={item.unit}
            quantity={item.quantity}
            onChange={onQuantityChange}
            onPressValue={item.unit === 'kg' ? onEditQuantity : undefined}
          />
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.lineTotal}>{formatINR(lineTotal)}</Text>
        <Pressable
          accessibilityLabel={`Remove ${item.name}`}
          onPress={confirmRemove}
          style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Feather name="trash-2" size={18} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm + 4,
    ...cardShadow,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
  },
  center: {
    flex: 1,
    marginHorizontal: spacing.sm + 4,
  },
  name: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  unitPrice: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  stepperWrap: {
    marginTop: spacing.sm,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  lineTotal: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CartItem;
