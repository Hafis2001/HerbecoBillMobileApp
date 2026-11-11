/**
 * Link / unlink billing catalogue products to stock items (bottom sheet).
 * A linked product deducts stock automatically every time it is sold:
 * the consumption is entered in the stock item's own unit
 * (default 1 per sale unit).
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
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
import { StockItemPickerModal } from './StockItemPickerModal';
import { displayUnitLabel, displayToBaseFactor, fromBaseQty, numericText, toBaseQty } from '../../utils/stock';
import { deleteProductLink, getProductLinks, setProductLink } from '../../store/stockDb';
import type { Product, ProductStockLink, StockItem } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

/** One draft row: a product with its linked item and consumption quantity. */
interface DraftLink {
  productId: string;
  productName: string;
  productUnit: 'kg' | 'unit';
  stockItemId?: string;
  stockItemName?: string;
  displayUnit?: string;
  qtyText: string;
}

interface ProductLinksModalProps {
  visible: boolean;
  products: Product[];
  stockItems: StockItem[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProductLinksModal({
  visible,
  products,
  stockItems,
  onClose,
  onSaved,
}: ProductLinksModalProps) {
  const insets = useSafeAreaInsets();
  const [drafts, setDrafts] = useState<DraftLink[]>([]);
  const [search, setSearch] = useState('');
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSaving(false);
    setPickingFor(null);
    // Start from the current links so the sheet is always grounded in DB truth.
    let cancelled = false;
    (async () => {
      let links: Record<string, ProductStockLink> = {};
      try {
        links = await getProductLinks();
      } catch (e) {
        console.log('loadProductLinks error', e);
      }
      if (cancelled) return;
      const plain = (p: Product): DraftLink => ({
        productId: p.id,
        productName: p.name,
        productUnit: p.unit,
        qtyText: '1',
      });
      setDrafts(
        products.map((p) => {
          const link = links[p.id];
          const item = link ? stockItems.find((s) => s.id === link.stockItemId) : undefined;
          if (!link || !item) return plain(p);
          return {
            productId: p.id,
            productName: p.name,
            productUnit: p.unit,
            stockItemId: item.id,
            stockItemName: item.name,
            displayUnit: item.displayUnit,
            qtyText: String(fromBaseQty(link.qtyBasePerUnit, item.displayUnit)),
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, products, stockItems]);

  const filtered = drafts.filter((d) =>
    d.productName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const pickingProduct = drafts.find((d) => d.productId === pickingFor) ?? null;

  const attachItem = (item: StockItem) => {
    if (!pickingFor) return;
    setDrafts((prev) =>
      prev.map((d) =>
        d.productId === pickingFor
          ? {
              ...d,
              stockItemId: item.id,
              stockItemName: item.name,
              displayUnit: item.displayUnit,
            }
          : d,
      ),
    );
    setPickingFor(null);
  };

  const detachItem = (productId: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.productId === productId
          ? { ...d, stockItemId: undefined, stockItemName: undefined, displayUnit: undefined, qtyText: '1' }
          : d,
      ),
    );
  };

  const updateQty = (productId: string, qtyText: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.productId === productId ? { ...d, qtyText: numericText(qtyText) } : d)),
    );
  };

  const onSubmit = async () => {
    if (saving) return;
    const linked = drafts.filter((d) => d.stockItemId);
    for (const d of linked) {
      const qty = Number.parseFloat(d.qtyText);
      if (!Number.isFinite(qty) || qty <= 0) {
        showToast(`Enter how much stock one "${d.productName}" sale should use`, 'error');
        return;
      }
    }
    setSaving(true);
    try {
      for (const d of drafts) {
        if (!d.stockItemId) {
          await deleteProductLink(d.productId).catch(() => {});
        } else {
          await setProductLink({
            productId: d.productId,
            stockItemId: d.stockItemId,
            qtyBasePerUnit: toBaseQty(
              Number.parseFloat(d.qtyText),
              d.displayUnit || 'piece',
            ),
          });
        }
      }
      showToast('Product links saved');
      onSaved();
      onClose();
    } catch (e) {
      showToast('Could not save the product links', 'error');
      console.log('saveProductLinks error', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.wrap}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text style={styles.title}>Link products to stock</Text>
                <Text style={styles.subtitle}>
                  Linked products deduct stock automatically on every sale.
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close form">
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Feather name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search products…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filtered.length === 0 ? (
                <Text style={styles.emptyLine}>
                  {products.length === 0
                    ? 'No products yet — add them in Settings → Products.'
                    : 'No product matches that search.'}
                </Text>
              ) : (
                filtered.map((d) => (
                  <View key={d.productId} style={styles.rowCard}>
                    <View style={styles.rowHead}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {d.productName}
                      </Text>
                      {d.stockItemId ? (
                        <Pressable
                          onPress={() => detachItem(d.productId)}
                          hitSlop={8}
                          accessibilityLabel={`Unlink ${d.productName}`}
                        >
                          <Feather name="slash" size={17} color={colors.danger} />
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setPickingFor(d.productId)}
                          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.8 }]}
                        >
                          <Feather name="link-2" size={15} color={colors.primary} />
                          <Text style={styles.linkBtnText}>Link stock</Text>
                        </Pressable>
                      )}
                    </View>
                    {d.stockItemId ? (
                      <View style={styles.linkedBox}>
                        <View style={styles.linkedMeta}>
                          <Feather name="box" size={15} color={colors.primary} />
                          <Text style={styles.linkedName} numberOfLines={1}>
                            {d.stockItemName}
                          </Text>
                        </View>
                        <View style={styles.qtyRow}>
                          <TextInput
                            value={d.qtyText}
                            onChangeText={(v) => updateQty(d.productId, v)}
                            keyboardType="decimal-pad"
                            style={styles.qtyInput}
                          />
                          <Text style={styles.qtyUnit}>
                            {displayUnitLabel(d.displayUnit as StockItem['displayUnit'])} per{' '}
                            {d.productUnit === 'kg' ? 'kg sold' : 'piece sold'}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))
              )}

              <PrimaryButton
                title={saving ? 'Saving…' : 'Save links'}
                onPress={() => void onSubmit()}
                disabled={saving}
                icon="link-2"
                style={styles.saveBtn}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <StockItemPickerModal
        visible={pickingFor !== null}
        items={stockItems}
        title={`Link stock to ${pickingProduct?.productName ?? 'product'}`}
        onClose={() => setPickingFor(null)}
        onPick={attachItem}
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
    paddingVertical: 0,
  },
  body: { paddingBottom: spacing.sm },
  emptyLine: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  rowCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  linkBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.primary,
  },
  linkedBox: { marginTop: spacing.xs + 2 },
  linkedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  linkedName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginLeft: 2,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyInput: {
    width: 90,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 42,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  qtyUnit: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  saveBtn: { marginTop: spacing.md },
});

export default ProductLinksModal;
