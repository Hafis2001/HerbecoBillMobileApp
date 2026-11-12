/**
 * Record a stock movement for one item (bottom sheet):
 *  - "restock": quantity received, price, supplier, note and date.
 *  - "adjust":  an increase or decrease with a required reason
 *               (e.g. wastage, damage, recount).
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { PrimaryButton } from '../PrimaryButton';
import { showToast } from '../Toast';
import { DISPLAY_UNITS, displayUnitLabel, fromBaseQty, numericText, toBaseQty } from '../../utils/stock';
import { recordAdjustment, recordRestock } from '../../store/stockDb';
import type { StockItem } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

/** Recent-day chips so a backdated movement needs no calendar picker. */
const DAY_CHIPS = [
  { label: 'Today', offset: 0 },
  { label: 'Yesterday', offset: 1 },
  { label: '2 days ago', offset: 2 },
  { label: '3 days ago', offset: 3 },
  { label: 'A week ago', offset: 7 },
];

interface StockMovementModalProps {
  visible: boolean;
  /** Which movement the sheet is recording. */
  mode: 'restock' | 'adjust';
  item: StockItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StockMovementModal({ visible, mode, item, onClose, onSaved }: StockMovementModalProps) {
  const insets = useSafeAreaInsets();
  const [qtyText, setQtyText] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('kg');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [priceText, setPriceText] = useState('');
  const [supplier, setSupplier] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQtyText('');
    setSelectedUnit(item?.displayUnit || 'piece');
    setDirection('increase');
    setPriceText('');
    setSupplier('');
    setReason('');
    setNote('');
    setDayOffset(0);
    setSaving(false);
  }, [visible, item]);

  const unitLabel = displayUnitLabel(selectedUnit);
  const availableUnits = item ? DISPLAY_UNITS[item.unitType] || [item.displayUnit] : [];

  const changeSelectedUnit = (newUnit: string) => {
    if (newUnit === selectedUnit) return;
    if (qtyText.trim()) {
      const val = Number.parseFloat(qtyText);
      if (Number.isFinite(val)) {
        const base = toBaseQty(val, selectedUnit);
        const converted = fromBaseQty(base, newUnit);
        setQtyText(String(converted));
      }
    }
    setSelectedUnit(newUnit);
  };

  const availableDisplay = useMemo(
    () => (item ? fromBaseQty(item.balance, selectedUnit) : 0),
    [item, selectedUnit],
  );

  const onSubmit = async () => {
    if (saving || !item) return;
    const qty = Number.parseFloat(qtyText);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast(`Enter a quantity in ${unitLabel}`, 'error');
      return;
    }
    const qtyBase = toBaseQty(qty, selectedUnit);

    if (mode === 'restock') {
      const price = priceText.trim() ? Number.parseFloat(priceText) : undefined;
      if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
        showToast('Purchase price must be a valid amount', 'error');
        return;
      }
      setSaving(true);
      try {
        await recordRestock({
          itemId: item.id,
          qtyBase,
          purchasePrice: price,
          supplier: supplier.trim() || undefined,
          note: note.trim() || undefined,
          createdAtMs: dayOffset > 0 ? Date.now() - dayOffset * 86_400_000 : undefined,
        });
        showToast(`Restocked ${item.name}`);
        onSaved();
        onClose();
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Could not record the restock',
          'error',
        );
        console.log('recordRestock error', e);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Adjustment
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showToast('A reason is required for adjustments', 'error');
      return;
    }
    const signed = direction === 'decrease' ? -qtyBase : qtyBase;
    const run = async () => {
      setSaving(true);
      try {
        await recordAdjustment({
          itemId: item.id,
          qtyChangeBase: signed,
          reason: trimmedReason,
          createdAtMs: dayOffset > 0 ? Date.now() - dayOffset * 86_400_000 : undefined,
        });
        showToast('Stock adjusted');
        onSaved();
        onClose();
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Could not record the adjustment',
          'error',
        );
        console.log('recordAdjustment error', e);
      } finally {
        setSaving(false);
      }
    };

    if (direction === 'decrease' && qty > availableDisplay) {
      Alert.alert(
        'Not enough stock',
        `You only have ${availableDisplay} ${unitLabel} of ${item.name}. Reduce the quantity first, or record a restock.`,
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    if (direction === 'decrease') {
      Alert.alert(
        'Decrease stock',
        `Remove ${qty} ${unitLabel} from ${item.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Decrease', style: 'destructive', onPress: () => void run() },
        ],
      );
      return;
    }
    await run();
  };

  const title = mode === 'restock' ? `Restock ${item?.name ?? ''}` : `Adjust ${item?.name ?? ''}`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.subtitle}>
                Available: {availableDisplay} {unitLabel}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close form">
              <Feather name="x" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {mode === 'adjust' ? (
              <>
                <Text style={styles.label}>Adjustment</Text>
                <View style={styles.segment}>
                  {(['increase', 'decrease'] as const).map((dir) => {
                    const active = direction === dir;
                    const isDecrease = dir === 'decrease';
                    return (
                      <Pressable
                        key={dir}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setDirection(dir)}
                        style={[
                          styles.segmentBtn,
                          active && {
                            backgroundColor: isDecrease ? colors.dangerSoft : colors.primary,
                            borderColor: isDecrease ? colors.danger : colors.primary,
                          },
                        ]}
                      >
                        <Feather
                          name={isDecrease ? 'arrow-down-circle' : 'arrow-up-circle'}
                          size={18}
                          color={
                            active ? (isDecrease ? colors.danger : colors.textOnPrimary) : colors.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.segmentText,
                            active && {
                              color: isDecrease ? colors.danger : colors.textOnPrimary,
                              fontFamily: fonts.semiBold,
                            },
                          ]}
                        >
                          {isDecrease ? 'Decrease' : 'Increase'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {availableUnits.length > 1 ? (
              <>
                <Text style={[styles.label, styles.inputGap]}>Measurement unit</Text>
                <View style={styles.unitChipRow}>
                  {availableUnits.map((u) => {
                    const active = selectedUnit === u;
                    return (
                      <Pressable
                        key={u}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => changeSelectedUnit(u)}
                        style={[styles.unitChip, active && styles.unitChipActive]}
                      >
                        <Text style={[styles.unitChipText, active && styles.unitChipTextActive]}>
                          {displayUnitLabel(u)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={[styles.label, styles.inputGap]}>
              Quantity ({unitLabel})
            </Text>
            <View style={styles.qtyRow}>
              <TextInput
                value={qtyText}
                onChangeText={(v) => setQtyText(numericText(v))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.qtyInput}
              />
              <Text style={styles.qtyUnit}>{unitLabel}</Text>
            </View>
            {mode === 'adjust' && direction === 'decrease' ? (
              <Text style={styles.helper}>
                Decreases can never take the stock below zero.
              </Text>
            ) : null}

            {mode === 'restock' ? (
              <>
                <Text style={[styles.label, styles.inputGap]}>Purchase price per {unitLabel} (optional)</Text>
                <View style={styles.qtyRow}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    value={priceText}
                    onChangeText={(v) => setPriceText(numericText(v))}
                    placeholder={item?.purchasePrice ? String(item.purchasePrice) : '0'}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.qtyInput}
                  />
                </View>

                <Text style={[styles.label, styles.inputGap]}>Supplier (optional)</Text>
                <TextInput
                  value={supplier}
                  onChangeText={setSupplier}
                  placeholder="e.g. Siva Traders"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                  autoCorrect={false}
                />
              </>
            ) : null}

            <Text style={[styles.label, styles.inputGap]}>
              {mode === 'adjust' ? 'Reason' : 'Note'} {mode === 'adjust' ? '' : '(optional)'}
            </Text>
            <TextInput
              value={mode === 'adjust' ? reason : note}
              onChangeText={mode === 'adjust' ? setReason : setNote}
              placeholder={
                mode === 'adjust'
                  ? 'e.g. Wastage, damaged bottles, recount'
                  : 'Anything worth remembering about this restock'
              }
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.notesInput]}
              multiline
            />

            <Text style={[styles.label, styles.inputGap]}>Date</Text>
            <View style={styles.chipRow}>
              {DAY_CHIPS.map((chip) => {
                const active = dayOffset === chip.offset;
                return (
                  <Pressable
                    key={chip.offset}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setDayOffset(chip.offset)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <PrimaryButton
              title={saving ? 'Saving…' : mode === 'restock' ? 'Add to stock' : 'Save adjustment'}
              onPress={() => void onSubmit()}
              disabled={saving}
              icon={mode === 'restock' ? 'plus' : direction === 'decrease' ? 'minus' : 'plus'}
              style={styles.saveBtn}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    maxHeight: '88%',
    ...cardShadow,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headText: { flex: 1, marginRight: spacing.sm },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  body: { paddingBottom: spacing.sm },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
  },
  inputGap: { marginTop: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  segment: { flexDirection: 'row', gap: spacing.sm },
  unitChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 4 },
  unitChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  unitChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  unitChipText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  unitChipTextActive: {
    color: colors.textOnPrimary,
    fontFamily: fonts.semiBold,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
  },
  segmentText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  qtyUnit: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    minWidth: 42,
  },
  rupee: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginRight: -4,
  },
  helper: {
    marginTop: spacing.xs,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm + 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  chipTextActive: { color: colors.textOnPrimary, fontFamily: fonts.semiBold },
  saveBtn: { marginTop: spacing.lg },
});

export default StockMovementModal;
