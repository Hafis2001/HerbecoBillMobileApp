/**
 * Filter chip (All / Kg / Unit) used above the product grid.
 */

import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import theme from '../constants/theme';

const { colors, radius, spacing, fonts, fontSize } = theme;

interface CategoryChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function CategoryChip({ label, active, onPress }: CategoryChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active ? styles.active : styles.inactive, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.text, active ? styles.textActive : styles.textInactive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  active: {
    backgroundColor: colors.primary,
  },
  inactive: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
  },
  textActive: {
    color: colors.textOnPrimary,
  },
  textInactive: {
    color: colors.textMuted,
  },
});

export default CategoryChip;
