/**
 * Quantity entry sheet for products sold by weight.
 *
 * The owner can type the weight in GRAMS ("150"), in KG ("0.15"), or type the
 * rupee AMOUNT the customer wants to spend and let the app work out the weight
 * ("₹100 -> 400 g at ₹250/kg"). The resolved weight is stored in the cart as kg
 * with gram precision and shown everywhere as grams while under 1 kg.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import theme from '../constants/theme';
import { formatINR, formatPriceWithUnit, formatQuantity, gramsToKg, kgToGrams } from '../utils/format';
import { round2 } from '../utils/pricing';
import type { Unit } from '../types';
import { PrimaryButton } from './PrimaryButton';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

type Mode = 'grams' | 'kg' | 'amount';

interface QuantityEntryModalProps {
  visible: boolean;
  productName: string;
  unit: Unit;
  /** Price per kg (weight products) or per piece, already flow-adjusted. */
  unitPrice: number;
  /** Current quantity in the cart (kg for weight products), 0 when new. */
  initialQuantity: number;
  onClose: () => void;
  onSubmit: (quantity: number) => void;
}

/** Keep weights at 1-gram precision. */
const roundQty = (qty: number) => Math.round((qty + Number.EPSILON) * 1000) / 1000;

const GRAM_CHIPS = [100, 250, 500, 750, 1000];
const AMOUNT_CHIPS = [50, 100, 200, 500];

export function QuantityEntryModal({
  visible,
  productName,
  unit,
  unitPrice,
  initialQuantity,
  onClose,
  onSubmit,
}: QuantityEntryModalProps) {
  const isWeight = unit === 'kg';
  const [mode, setMode] = useState<Mode>(isWeight ? 'grams' : 'kg');
  const [text, setText] = useState('');

  // Reset the sheet every time it opens, pre-filled with the cart quantity.
  useEffect(() => {
    if (!visible) return;
    if (!isWeight) {
      setMode('kg');
      setText(initialQuantity > 0 ? String(Math.round(initialQuantity)) : '');
      return;
    }
    setMode('grams');
    setText(initialQuantity > 0 ? String(kgToGrams(initialQuantity)) : '');
  }, [visible, isWeight, initialQuantity]);

  const typed = Number(text.replace(/[^0-9.]/g, ''));

  /** The quantity in kg (or whole pieces) that the typed value means. */
  const quantity = useMemo(() => {
    if (!Number.isFinite(typed) || typed <= 0) return 0;
    if (!isWeight) return Math.round(typed);
    if (mode === 'grams') return roundQty(gramsToKg(typed));
    if (mode === 'kg') return roundQty(typed);
    // Amount mode: how much weight does ₹<typed> buy?
    if (unitPrice <= 0) return 0;
    return roundQty(typed / unitPrice);
  }, [typed, isWeight, mode, unitPrice]);

  const lineTotal = round2(quantity * unitPrice);
  const valid = quantity > 0;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    // Carry the current weight across when moving between grams and kg so the
    // number on screen keeps meaning the same thing.
    if (isWeight && quantity > 0 && (next === 'grams' || next === 'kg')) {
      setText(next === 'grams' ? String(kgToGrams(quantity)) : String(quantity));
    } else if (next === 'amount' && quantity > 0) {
      setText(String(Math.round(quantity * unitPrice)));
    } else {
      setText('');
    }
    setMode(next);
  };

  const applyChip = (value: number) => {
    if (mode === 'amount') {
      setText(String(value));
      return;
    }
    setText(String(value));
  };

  const hint = (() => {
    if (!isWeight) return 'Type how many pieces the customer is buying.';
    if (mode === 'grams') return 'Type the weight in grams, e.g. 150 for 150 g.';
    if (mode === 'kg') return 'Type the weight in kg, e.g. 1.25 for 1 kg 250 g.';
    return `Type the rupees the customer wants to spend. At ${formatPriceWithUnit(unitPrice, 'kg')} that buys the weight below.`;
  })();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdropTouch} onPress={onClose} accessibilityLabel="Close" />

        <View style={[styles.sheet, cardShadow]}>
          <View style={styles.grabber} />

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
          <Text style={styles.title} numberOfLines={2}>
            {productName}
          </Text>
          <Text style={styles.subtitle}>{formatPriceWithUnit(unitPrice, unit)}</Text>

          {isWeight ? (
            <View style={styles.tabs}>
              {(
                [
                  { key: 'grams', label: 'Grams' },
                  { key: 'kg', label: 'Kg' },
                  { key: 'amount', label: '₹ Amount' },
                ] as Array<{ key: Mode; label: string }>
              ).map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => switchMode(tab.key)}
                  style={[styles.tab, mode === tab.key && styles.tabActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mode === tab.key }}
                >
                  <Text style={[styles.tabText, mode === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.inputWrap}>
            <Text style={styles.inputPrefix}>{mode === 'amount' ? '₹' : ''}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              placeholder={mode === 'amount' ? '100' : mode === 'grams' ? '150' : '1'}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus={Platform.OS === 'ios'}
              selectTextOnFocus
            />
            {isWeight ? (
              <Text style={styles.inputSuffix}>{mode === 'grams' ? 'g' : mode === 'kg' ? 'kg' : '₹'}</Text>
            ) : (
              <Text style={styles.inputSuffix}>unit</Text>
            )}
          </View>

          <Text style={styles.hint}>{hint}</Text>

          <View style={styles.chips}>
            {(mode === 'amount' ? AMOUNT_CHIPS : GRAM_CHIPS).map((value) => (
              <Pressable
                key={value}
                onPress={() => applyChip(value)}
                style={styles.chip}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>
                  {mode === 'amount'
                    ? `₹${value}`
                    : mode === 'kg'
                      ? `${value / 1000} kg`
                      : `${value} g`}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryLeft}>
              <Feather name="shopping-bag" size={15} color={colors.primary} />
              <Text style={styles.summaryQty}>
                {valid ? formatQuantity(quantity, unit) : '—'}
              </Text>
            </View>
            <Text style={styles.summaryTotal}>{valid ? formatINR(lineTotal) : formatINR(0)}</Text>
          </View>
          </ScrollView>

          <PrimaryButton
            title={initialQuantity > 0 ? 'Update cart' : 'Add to cart'}
            icon="check"
            onPress={() => valid && onSubmit(quantity)}
            disabled={!valid}
          />
          <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(16, 30, 22, 0.45)',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg ?? radius.md,
    borderTopRightRadius: radius.lg ?? radius.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetScrollContent: {
    paddingBottom: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: spacing.sm + 2,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md + 1,
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: 4,
    marginTop: spacing.md,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.textOnPrimary,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    minHeight: 58,
  },
  inputPrefix: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.primary,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.lg + 2,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  inputSuffix: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  hint: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    lineHeight: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm + 2,
  },
  chip: {
    paddingHorizontal: 12,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.primary,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryQty: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  summaryTotal: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: 4,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});

export default QuantityEntryModal;
