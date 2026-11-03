/**
 * Quantity stepper (- qty +). Step and display precision differ for
 * weight ("kg", step 0.5, decimals allowed) vs whole items ("unit").
 */

import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatQuantity } from '../utils/format';
import type { Unit } from '../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface QuantitySelectorProps {
  quantity: number;
  unit: Unit;
  onChange: (quantity: number) => void;
  /** Called only when the quantity would go below the minimum (back to Add). */
  onRemove?: () => void;
  /** When set, tapping the quantity opens a precise weight/amount entry sheet. */
  onPressValue?: () => void;
  size?: 'md' | 'sm';
}

/** Weight is kept to 1 gram (3 decimals of a kg); pieces are whole. */
function precisionFor(unit: Unit): number {
  return unit === 'kg' ? 3 : 0;
}

export function QuantitySelector({
  quantity,
  unit,
  onChange,
  onRemove,
  onPressValue,
  size = 'md',
}: QuantitySelectorProps) {
  // Under 1 kg the stepper moves in 50 g steps (useful when someone typed
  // "150 g"); at 1 kg and above it moves in half-kilo steps.
  const step = unit === 'kg' ? (quantity < 1 ? 0.05 : 0.5) : 1;
  const dim = size === 'sm' ? 32 : 40;
  const round = (q: number) => Number(q.toFixed(precisionFor(unit)));

  const decrement = () => {
    const next = round(quantity - step);
    if (next <= 0) {
      onRemove ? onRemove() : onChange(0);
      return;
    }
    onChange(next);
  };

  const increment = () => onChange(round(quantity + step));

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="Decrease quantity"
        onPress={decrement}
        style={[styles.btn, { width: dim, height: dim }, cardShadow]}
        hitSlop={6}
      >
        <Feather name="minus" size={size === 'sm' ? 14 : 18} color={colors.primary} />
      </Pressable>
      <Pressable
        accessibilityLabel={onPressValue ? 'Type a precise quantity' : undefined}
        accessibilityRole={onPressValue ? 'button' : undefined}
        disabled={!onPressValue}
        onPress={onPressValue}
        style={[styles.value, { maxWidth: size === 'sm' ? 74 : 96 }]}
        hitSlop={onPressValue ? 6 : undefined}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            styles.valueText,
            size === 'sm' && { fontSize: fontSize.sm },
            Boolean(onPressValue) && styles.valueTextEditable,
          ]}
        >
          {formatQuantity(quantity, unit)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Increase quantity"
        onPress={increment}
        style={[styles.btn, { width: dim, height: dim }, cardShadow]}
        hitSlop={6}
      >
        <Feather name="plus" size={size === 'sm' ? 14 : 18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  btn: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  value: {
    minHeight: 44,
    justifyContent: 'center',
    // Shrink instead of pushing the "+" button off a narrow product card.
    flexShrink: 1,
    minWidth: 44,
  },
  valueText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'center',
  },
  valueTextEditable: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});

export default QuantitySelector;
