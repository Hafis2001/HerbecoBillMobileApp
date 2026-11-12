/**
 * Add / edit a stock item (bottom sheet).
 *
 * Add: name, category, unit type + measurement unit, opening stock,
 * minimum alert level, optional purchase price and notes.
 * Edit: the units are locked after creation (they define the ledger's
 * meaning), everything else stays editable.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { PrimaryButton } from '../PrimaryButton';
import { showToast } from '../Toast';
import { ProductPickerModal } from './ProductPickerModal';
import {
  DISPLAY_UNITS,
  UNIT_TYPES,
  displayUnitLabel,
  fromBaseQty,
  numericText,
  toBaseQty,
} from '../../utils/stock';
import {
  addStockForProduct,
  deleteStockItem,
  updateStockItemDetails,
} from '../../store/stockDb';
import type { Product, StockDisplayUnit, StockItem, StockUnitType } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const CATEGORY_PRESETS = ['Ingredients', 'Packaging', 'Liquids', 'General'];

interface StockFormModalProps {
  visible: boolean;
  /** Item being edited, or null to add a new one. */
  editing: StockItem | null;
  /** Products from Settings → Products, used to add stock. */
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}

export function StockFormModal({
  visible,
  editing,
  products,
  onClose,
  onSaved,
}: StockFormModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [category, setCategory] = useState('Ingredients');
  const [unitType, setUnitType] = useState<StockUnitType>('weight');
  const [displayUnit, setDisplayUnit] = useState<StockDisplayUnit>('kg');
  const [openingText, setOpeningText] = useState('');
  const [minText, setMinText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setCategory(editing.category);
      setUnitType(editing.unitType);
      setDisplayUnit(editing.displayUnit);
      setOpeningText('');
      setMinText(
        editing.minQtyBase > 0
          ? String(fromBaseQty(editing.minQtyBase, editing.displayUnit))
          : '',
      );
      setPriceText(editing.purchasePrice ? String(editing.purchasePrice) : '');
      setNotes(editing.notes ?? '');
    } else {
      setName('');
      setSelectedProductId(null);
      setPickerOpen(false);
      setCategory('Ingredients');
      setUnitType('weight');
      setDisplayUnit('kg');
      setOpeningText('');
      setMinText('');
      setPriceText('');
      setNotes('');
    }
    setSaving(false);
  }, [visible, editing]);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const chooseProduct = (product: Product) => {
    setPickerOpen(false);
    setSelectedProductId(product.id);
    setName(product.name);
    const nextType: StockUnitType = product.unit === 'kg' ? 'weight' : 'piece';
    setUnitType(nextType);
    setDisplayUnit(product.unit === 'kg' ? 'kg' : 'piece');
  };

  const pickUnitType = (type: StockUnitType) => {
    if (editing || selectedProduct) return;
    setUnitType(type);
    setDisplayUnit(DISPLAY_UNITS[type][0]);
  };

  const changeDisplayUnit = (newUnit: string) => {
    if (newUnit === displayUnit) return;
    if (minText.trim()) {
      const val = Number.parseFloat(minText);
      if (Number.isFinite(val)) {
        const base = toBaseQty(val, displayUnit);
        const converted = fromBaseQty(base, newUnit);
        setMinText(String(converted));
      }
    }
    if (openingText.trim()) {
      const val = Number.parseFloat(openingText);
      if (Number.isFinite(val)) {
        const base = toBaseQty(val, displayUnit);
        const converted = fromBaseQty(base, newUnit);
        setOpeningText(String(converted));
      }
    }
    setDisplayUnit(newUnit);
  };

  const unitLabel = displayUnitLabel(displayUnit);
  const toBase = (text: string): number | null => {
    const value = Number.parseFloat(text);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  const onSubmit = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (editing && !trimmedName) {
      showToast('Stock item name is required', 'error');
      return;
    }
    if (!editing && !selectedProduct) {
      showToast('Select a product first', 'error');
      return;
    }
    const minQty = toBase(minText || '0');
    if (minQty === null) {
      showToast('Minimum stock must be a valid quantity', 'error');
      return;
    }
    const price = priceText.trim() ? Number.parseFloat(priceText) : undefined;
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      showToast('Purchase price must be a valid amount', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateStockItemDetails(editing.id, {
          name: trimmedName,
          category,
          displayUnit,
          minQtyBase: toBaseQty(minQty, displayUnit),
          purchasePrice: price,
          notes,
        });
        showToast('Stock item updated');
      } else if (selectedProduct) {
        const opening = toBase(openingText || '0');
        if (opening === null) {
          setSaving(false);
          showToast('Opening stock must be a valid quantity', 'error');
          return;
        }
        await addStockForProduct({
          product: selectedProduct,
          category,
          displayUnit,
          minQtyBase: toBaseQty(minQty, displayUnit),
          purchasePrice: price,
          notes,
          qtyBase: toBaseQty(opening, displayUnit),
        });
        showToast('Stock item added');
      }
      onSaved();
      onClose();
    } catch (e) {
      showToast('Could not save the stock item', 'error');
      console.log('saveStockItem error', e);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!editing) return;
    Alert.alert(
      'Delete stock item',
      `Delete "${editing.name}"? Only possible while it has no stock history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteStockItem(editing.id);
              showToast('Stock item deleted');
              onSaved();
              onClose();
            } catch (e) {
              showToast(e instanceof Error ? e.message : 'Could not delete', 'error');
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={styles.wrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{editing ? 'Edit Stock Item' : 'Add Stock Item'}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close form">
              <Feather name="x" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {editing ? (
              <>
                <Text style={styles.label}>Stock item name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Coffee, Milk, Empty Bottle"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Product</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select product"
                  onPress={() => setPickerOpen(true)}
                  style={({ pressed }) => [styles.selectInput, pressed && { opacity: 0.85 }]}
                >
                  <Text
                    style={selectedProduct ? styles.selectValue : styles.selectPlaceholder}
                    numberOfLines={1}
                  >
                    {selectedProduct ? selectedProduct.name : 'Select a product'}
                  </Text>
                  <Feather name="chevron-down" size={18} color={colors.textMuted} />
                </Pressable>
                {products.length === 0 ? (
                  <Text style={styles.helper}>
                    No products yet — add them in Settings → Products first.
                  </Text>
                ) : null}
              </>
            )}

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORY_PRESETS.map((preset) => {
                const active = category === preset;
                return (
                  <Pressable
                    key={preset}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(preset)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Or type your own category"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.inputGap]}
              returnKeyType="next"
            />

            <Text style={styles.label}>Unit type</Text>
            <View style={styles.segment}>
              {UNIT_TYPES.map((type) => {
                const active = unitType === type.key;
                return (
                  <Pressable
                    key={type.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={Boolean(editing) || Boolean(selectedProduct)}
                    onPress={() => pickUnitType(type.key)}
                    style={[
                      styles.segmentBtn,
                      active && styles.segmentBtnActive,
                      (editing || selectedProduct) && styles.locked,
                    ]}
                  >
                    <Text style={[styles.segmentTitle, active && styles.segmentTitleActive]}>
                      {type.label}
                    </Text>
                    <Text style={[styles.segmentHint, active && styles.segmentHintActive]}>
                      {type.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, styles.inputGap]}>Measurement unit</Text>
            <View style={styles.segment}>
              {DISPLAY_UNITS[unitType].map((unit) => {
                const active = displayUnit === unit;
                return (
                  <Pressable
                    key={unit}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => changeDisplayUnit(unit)}
                    style={[styles.unitBtn, active && styles.unitBtnActive]}
                  >
                    <Text style={[styles.unitText, active && styles.unitTextActive]}>
                      {displayUnitLabel(unit)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {editing || selectedProduct ? (
              <Text style={styles.lockNote}>
                Category ({unitType}) is fixed, but you can switch display units (e.g. kg ↔ g, pieces ↔ bottles).
              </Text>
            ) : null}

            {!editing ? (
              <>
                <Text style={[styles.label, styles.inputGap]}>Opening stock quantity</Text>
                <View style={styles.qtyRow}>
                  <TextInput
                    value={openingText}
                    onChangeText={(v) => setOpeningText(numericText(v))}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.qtyInput}
                  />
                  <Text style={styles.qtyUnit}>{unitLabel}</Text>
                </View>
              </>
            ) : null}

            <Text style={[styles.label, styles.inputGap]}>Minimum stock alert</Text>
            <View style={styles.qtyRow}>
              <TextInput
                value={minText}
                onChangeText={(v) => setMinText(numericText(v))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.qtyInput}
              />
              <Text style={styles.qtyUnit}>{unitLabel}</Text>
            </View>
            <Text style={styles.helper}>
              You will see a Low Stock alert when the balance reaches this level.
            </Text>

            <Text style={[styles.label, styles.inputGap]}>Purchase price per {unitLabel} (optional)</Text>
            <View style={styles.qtyRow}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                value={priceText}
                onChangeText={(v) => setPriceText(numericText(v))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.qtyInput}
              />
            </View>

            <Text style={[styles.label, styles.inputGap]}>Notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything worth remembering about this item"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.notesInput]}
              multiline
            />

            <PrimaryButton
              title={saving ? 'Saving…' : editing ? 'Save changes' : 'Add stock item'}
              onPress={() => void onSubmit()}
              disabled={saving}
              icon="check"
              style={styles.saveBtn}
            />
            {editing ? (
              <PrimaryButton
                title="Delete item"
                variant="ghost"
                small
                icon="trash-2"
                onPress={onDelete}
                style={styles.deleteBtn}
              />
            ) : null}
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <ProductPickerModal
        visible={pickerOpen}
        products={products}
        title="Select Product"
        onClose={() => setPickerOpen(false)}
        onPick={chooseProduct}
      />
    </>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
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
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  selectValue: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.medium,
  },
  selectPlaceholder: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontFamily: fonts.regular,
  },
  notesInput: {
    minHeight: 76,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  segmentTitleActive: { color: colors.textOnPrimary },
  segmentHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
  segmentHintActive: { color: colors.accentSoft },
  unitBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  unitBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  unitTextActive: { color: colors.textOnPrimary },
  locked: { opacity: 0.65 },
  lockNote: {
    marginTop: spacing.xs + 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
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
  saveBtn: { marginTop: spacing.lg },
  deleteBtn: { marginTop: spacing.sm },
});

export default StockFormModal;
