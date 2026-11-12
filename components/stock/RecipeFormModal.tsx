/**
 * Add / edit a production recipe (bottom sheet): name, photo, selling rate,
 * finished product unit (pieces, bottles, packets, boxes, kg), ingredient lines
 * (existing stock item + quantity and unit per ONE finished unit) and notes.
 */

import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
  displayUnitLabel,
  displayUnitSingle,
  fromBaseQty,
  numericText,
  toBaseQty,
} from '../../utils/stock';
import { persistImage } from '../../utils/imageStore';
import {
  deleteRecipe,
  ensureProductStockItem,
  saveRecipe,
  updateRecipe,
  type ProductStockInfo,
  type RecipeIngredientInput,
} from '../../store/stockDb';
import type { Product, Recipe, StockItem, StockUnitType } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface DraftLine {
  stockItemId: string;
  name: string;
  unitType: StockUnitType;
  selectedUnit: string;
  qtyText: string;
}

const FINISHED_UNIT_OPTIONS = [
  { key: 'bottle', label: 'Bottles' },
  { key: 'piece', label: 'Pieces' },
  { key: 'packet', label: 'Packets' },
  { key: 'box', label: 'Boxes' },
  { key: 'kg', label: 'Kilograms (kg)' },
];

interface RecipeFormModalProps {
  visible: boolean;
  /** Recipe being edited, or null to add a new one. */
  editing: Recipe | null;
  stockItems: StockItem[];
  /** Products from Settings → Products, used for the ingredient materials. */
  products: Product[];
  /** Current stock availability keyed by product id. */
  productStock: Record<string, ProductStockInfo>;
  onClose: () => void;
  onSaved: () => void;
}

export function RecipeFormModal({
  visible,
  editing,
  stockItems,
  products,
  productStock,
  onClose,
  onSaved,
}: RecipeFormModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [finishedUnit, setFinishedUnit] = useState('bottle');
  const [notes, setNotes] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      setPriceText(editing.price ? String(editing.price) : '');
      setFinishedUnit(editing.finishedUnit || 'bottle');
      setNotes(editing.notes ?? '');
      setImageUri(editing.imageUri);
      setLines(
        editing.items.map((line) => {
          const item = stockItems.find((s) => s.id === line.stockItemId);
          const uType = item?.unitType || 'piece';
          let defUnit =
            item?.displayUnit ||
            (uType === 'weight' ? 'g' : uType === 'volume' ? 'ml' : 'piece');
          if (uType === 'weight') {
            defUnit =
              line.qtyPerUnitBase >= 1000 && line.qtyPerUnitBase % 1000 === 0
                ? 'kg'
                : 'g';
          } else if (uType === 'volume') {
            defUnit =
              line.qtyPerUnitBase >= 1000 && line.qtyPerUnitBase % 1000 === 0
                ? 'l'
                : 'ml';
          }
          const val = fromBaseQty(line.qtyPerUnitBase, defUnit);
          return {
            stockItemId: line.stockItemId,
            name: item?.name ?? 'Removed stock item',
            unitType: uType,
            selectedUnit: defUnit,
            qtyText: String(val),
          };
        }),
      );
    } else {
      setName('');
      setPriceText('');
      setFinishedUnit('bottle');
      setNotes('');
      setImageUri(undefined);
      setLines([]);
    }
    setSaving(false);
  }, [visible, editing, stockItems]);

  const usedProductIds = Array.from(
    new Set(
      lines.flatMap((line) => {
        const linked = Object.keys(productStock).find(
          (productId) => productStock[productId].stockItemId === line.stockItemId,
        );
        if (linked) return [linked];
        const lineName = line.name.trim().toLowerCase();
        const byName = products.find(
          (product) => product.name.trim().toLowerCase() === lineName,
        );
        return byName ? [byName.id] : [];
      }),
    ),
  );

  const pickImage = async (useCamera: boolean) => {
    const hasPermission = useCamera
      ? (await ImagePicker.requestCameraPermissionsAsync()).granted
      : (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
    if (!hasPermission) {
      Alert.alert(
        'Permission needed',
        'Please allow camera/photo access from Settings to add recipe photos.',
        [{ text: 'OK' }],
      );
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: true,
          aspect: [1, 1],
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: true,
          aspect: [1, 1],
        });
    if (!result.canceled && result.assets[0]) {
      setImageUri(await persistImage(result.assets[0].uri));
    }
  };

  const addIngredient = async (product: Product) => {
    setPickerOpen(false);
    const uType: StockUnitType = product.unit === 'kg' ? 'weight' : 'piece';
    const defUnit = product.unit === 'kg' ? 'g' : 'piece';
    let stockItemId: string;
    try {
      stockItemId = await ensureProductStockItem(product, 'material');
    } catch (e) {
      showToast('Could not add this product to stock', 'error');
      console.log('ensureProductStockItem error', e);
      return;
    }
    setLines((prev) => {
      if (prev.some((l) => l.stockItemId === stockItemId)) return prev;
      return [
        ...prev,
        {
          stockItemId,
          name: product.name,
          unitType: uType,
          selectedUnit: defUnit,
          qtyText: '',
        },
      ];
    });
  };

  const updateLineQty = (stockItemId: string, qtyText: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.stockItemId === stockItemId ? { ...l, qtyText: numericText(qtyText) } : l,
      ),
    );
  };

  const changeLineUnit = (stockItemId: string, newUnit: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.stockItemId !== stockItemId) return l;
        if (l.selectedUnit === newUnit) return l;
        let newQty = l.qtyText;
        if (l.qtyText.trim()) {
          const val = Number.parseFloat(l.qtyText);
          if (Number.isFinite(val)) {
            const base = toBaseQty(val, l.selectedUnit);
            newQty = String(fromBaseQty(base, newUnit));
          }
        }
        return { ...l, selectedUnit: newUnit, qtyText: newQty };
      }),
    );
  };

  const removeLine = (stockItemId: string) => {
    setLines((prev) => prev.filter((l) => l.stockItemId !== stockItemId));
  };

  const finishedSingleLabel = displayUnitSingle(finishedUnit);

  const onSubmit = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Product name is required', 'error');
      return;
    }
    const rateVal = priceText.trim() ? Number.parseFloat(priceText) : 0;
    if (!Number.isFinite(rateVal) || rateVal < 0) {
      showToast('Selling rate must be a valid amount', 'error');
      return;
    }
    const validLines = lines.filter((l) => l.qtyText.trim() !== '');
    if (lines.length === 0 || validLines.length !== lines.length) {
      showToast('Add at least one ingredient with its quantity', 'error');
      return;
    }
    const ingredients: RecipeIngredientInput[] = validLines.map((l) => ({
      stockItemId: l.stockItemId,
      qtyPerUnitBase: toBaseQty(Number.parseFloat(l.qtyText), l.selectedUnit),
    }));
    if (
      ingredients.some((i) => !Number.isFinite(i.qtyPerUnitBase) || i.qtyPerUnitBase <= 0)
    ) {
      showToast('Ingredient quantities must be greater than zero', 'error');
      return;
    }

    const matchedProduct = products.find(
      (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    const productId = matchedProduct?.id ?? editing?.productId;

    setSaving(true);
    try {
      if (editing) {
        await updateRecipe(editing.id, {
          name: trimmedName,
          imageUri,
          price: rateVal,
          finishedUnit,
          notes,
          productId,
          items: ingredients,
        });
        showToast('Recipe updated! Tap "Produce" on the card to make a batch.');
      } else {
        await saveRecipe({
          name: trimmedName,
          imageUri,
          price: rateVal,
          finishedUnit,
          notes,
          productId,
          items: ingredients,
        });
        showToast('Recipe created! Tap "Produce" on the card to make a batch.');
      }
      onSaved();
      onClose();
    } catch (e) {
      showToast('Could not save the product recipe', 'error');
      console.log('saveRecipe error', e);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!editing) return;
    Alert.alert(
      'Delete product recipe',
      `Delete "${editing.name}"? Only possible while it has no production history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecipe(editing.id);
              showToast('Product recipe deleted');
              onSaved();
              onClose();
            } catch (e) {
              showToast(
                e instanceof Error ? e.message : 'Could not delete the recipe',
                'error',
              );
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
              <Text style={styles.title}>
                {editing ? 'Edit Production Product' : 'New Production Product'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close form">
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.photoRow}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.preview} />
                ) : (
                  <View style={[styles.preview, styles.previewPlaceholder]}>
                    <Feather name="feather" size={22} color={colors.primary} />
                  </View>
                )}
                <View style={styles.photoButtons}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pickImage(true)}
                    style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.85 }]}
                  >
                    <Feather name="camera" size={16} color={colors.primary} />
                    <Text style={styles.photoBtnText}>Camera</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void pickImage(false)}
                    style={({ pressed }) => [
                      styles.photoBtn,
                      { backgroundColor: colors.accentSoft },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Feather name="image" size={16} color={colors.primary} />
                    <Text style={styles.photoBtnText}>Gallery</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.label}>Product name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Bottled Coffee, Herbal Tea, Honey Jar"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                returnKeyType="next"
              />

              <Text style={[styles.label, styles.inputGap]}>Finished product unit</Text>
              <View style={styles.unitChipRow}>
                {FINISHED_UNIT_OPTIONS.map((opt) => {
                  const active = finishedUnit === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setFinishedUnit(opt.key)}
                      style={[styles.unitChip, active && styles.unitChipActive]}
                    >
                      <Text
                        style={[
                          styles.unitChipText,
                          active && styles.unitChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, styles.inputGap]}>
                Selling price / Rate (₹ per {finishedSingleLabel})
              </Text>
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
                <Text style={styles.qtyUnit}>per {finishedSingleLabel}</Text>
              </View>

              <Text style={[styles.label, styles.inputGap]}>
                Recipe Materials (Required per 1 {finishedSingleLabel})
              </Text>
              <Text style={styles.helper}>
                Select materials from existing stock and set exact quantities consumed per 1{' '}
                {finishedSingleLabel}.
              </Text>

              {lines.map((line) => {
                const availableUnits = DISPLAY_UNITS[line.unitType] || [line.selectedUnit];
                return (
                  <View key={line.stockItemId} style={styles.lineCard}>
                    <View style={styles.lineHead}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {line.name}
                      </Text>
                      <Pressable
                        onPress={() => removeLine(line.stockItemId)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${line.name}`}
                      >
                        <Feather name="trash-2" size={17} color={colors.danger} />
                      </Pressable>
                    </View>

                    <View style={styles.lineInputRow}>
                      <TextInput
                        value={line.qtyText}
                        onChangeText={(v) => updateLineQty(line.stockItemId, v)}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        style={styles.lineQtyInput}
                      />
                      <View style={styles.lineUnits}>
                        {availableUnits.map((u) => {
                          const active = line.selectedUnit === u;
                          return (
                            <Pressable
                              key={u}
                              onPress={() => changeLineUnit(line.stockItemId, u)}
                              style={[
                                styles.unitMiniBtn,
                                active && styles.unitMiniBtnActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.unitMiniText,
                                  active && styles.unitMiniTextActive,
                                ]}
                              >
                                {displayUnitLabel(u)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}

              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                style={({ pressed }) => [styles.addLineBtn, pressed && { opacity: 0.8 }]}
              >
                <Feather name="plus-circle" size={19} color={colors.primary} />
                <Text style={styles.addLineText}>Select Product Material</Text>
              </Pressable>

              <Text style={[styles.label, styles.inputGap]}>Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Batch instructions, formula notes, etc."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.notesInput]}
                multiline
              />

              <View style={styles.deductionNotice}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={styles.deductionNoticeText}>
                  Saving defines the recipe. Materials are deducted from stock when you confirm a batch under "Produce".
                </Text>
              </View>

              <PrimaryButton
                title={saving ? 'Saving…' : editing ? 'Save changes' : 'Save Product & Recipe'}
                onPress={() => void onSubmit()}
                disabled={saving}
                icon="check"
                style={styles.saveBtn}
              />
              {editing ? (
                <PrimaryButton
                  title="Delete product recipe"
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
        availability={productStock}
        excludeIds={usedProductIds}
        title="Select Product Material"
        onClose={() => setPickerOpen(false)}
        onPick={(product) => void addIngredient(product)}
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
    maxHeight: '92%',
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
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  preview: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  previewPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoButtons: { flex: 1, gap: spacing.sm },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accentSoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  photoBtnText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputGap: { marginTop: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  unitChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  unitChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 3,
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
    minHeight: 46,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  qtyUnit: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  rupee: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  helper: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  lineCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs + 4,
  },
  lineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  lineName: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginRight: spacing.sm,
  },
  lineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lineQtyInput: {
    width: 100,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: fonts.semiBold,
    minHeight: 38,
  },
  lineUnits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  unitMiniBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  unitMiniBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  unitMiniText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  unitMiniTextActive: {
    color: colors.textOnPrimary,
    fontFamily: fonts.semiBold,
  },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: colors.accentSoft,
  },
  addLineText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  deductionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accentSoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.md,
  },
  deductionNoticeText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
  },
  saveBtn: { marginTop: spacing.lg },
  deleteBtn: { marginTop: spacing.sm },
});

export default RecipeFormModal;
