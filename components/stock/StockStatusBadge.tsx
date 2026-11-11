/**
 * Small status chip for a stock item: In Stock (green), Low Stock (gold)
 * or Out of Stock (red), with a leading dot.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../../constants/theme';
import { STATUS_LABEL } from '../../utils/stock';
import type { StockStatus } from '../../types';

const { colors, radius, fonts, fontSize } = theme;

const STYLES: Record<StockStatus, { bg: string; fg: string }> = {
  in: { bg: colors.accentSoft, fg: colors.primary },
  low: { bg: colors.goldSoft, fg: colors.gold },
  out: { bg: colors.dangerSoft, fg: colors.danger },
};

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const s = STYLES[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.text, { color: s.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    letterSpacing: 0.3,
  },
});

export default StockStatusBadge;
