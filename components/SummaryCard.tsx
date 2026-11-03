/**
 * Bill summary card: Subtotal, GST 5% and the gold highlighted Grand Total.
 * All numbers must already be computed by utils/pricing.computeTotals.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { formatINR } from '../utils/format';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface SummaryCardProps {
  subtotal: number;
  gst: number;
  grandTotal: number;
}

export function SummaryCard({ subtotal, gst, grandTotal }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      <SummaryRow label="Subtotal" value={formatINR(subtotal)} />
      <SummaryRow label="GST (5%)" value={formatINR(gst)} />
      <View style={styles.grandRow}>
        <Text style={styles.grandLabel}>Grand Total</Text>
        <Text style={styles.grandValue}>{formatINR(grandTotal)}</Text>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    ...cardShadow,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  value: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  grandLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textOnPrimary,
  },
  grandValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.textOnPrimary,
  },
});

export default SummaryCard;
