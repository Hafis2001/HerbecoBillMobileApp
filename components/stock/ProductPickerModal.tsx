/**
 * Searchable picker for billing products, used when adding stock or
 * picking production materials. Shows each product's current stock
 * availability alongside its name.
 */

import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { formatBaseQty } from '../../utils/stock';
import type { ProductStockInfo } from '../../store/stockDb';
import type { Product } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface ProductPickerModalProps {
  visible: boolean;
  products: Product[];
  /** Availability keyed by product id, from getProductStockBalances(). */
  availability?: Record<string, ProductStockInfo>;
  /** Product ids to hide from the list (already picked, for example). */
  excludeIds?: string[];
  title: string;
  onClose: () => void;
  onPick: (product: Product) => void;
}

function availabilityText(
  product: Product,
  info: ProductStockInfo | undefined,
): string {
  if (!info) {
    return `Available: 0 ${product.unit === 'kg' ? 'kg' : 'unit'}`;
  }
  if (info.unitType === 'weight') {
    return `Available: ${formatBaseQty(info.balanceBase, 'weight')}`;
  }
  return `Available: ${formatBaseQty(info.availableUnits, 'piece', info.displayUnit)}`;
}

export function ProductPickerModal({
  visible,
  products,
  availability,
  excludeIds,
  title,
  onClose,
  onPick,
}: ProductPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const pool = useMemo(
    () =>
      excludeIds && excludeIds.length > 0
        ? products.filter((p) => !excludeIds.includes(p.id))
        : products,
    [products, excludeIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((p) => p.name.toLowerCase().includes(q));
  }, [pool, search]);

  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close picker">
              <Feather name="x" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Feather name="search" size={17} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoFocus
            />
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.emptyLine}>
              {pool.length === 0
                ? 'No products available — add them in Settings → Products first.'
                : 'No product matches that search.'}
            </Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Pick ${item.name}`}
                  onPress={() => {
                    onPick(item);
                    setSearch('');
                  }}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
                >
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {availabilityText(item, availability?.[item.id])}
                    </Text>
                  </View>
                  <Feather name="plus-circle" size={20} color={colors.primary} />
                </Pressable>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '75%',
    ...cardShadow,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginRight: spacing.sm,
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
    minHeight: 46,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
    paddingVertical: 0,
  },
  emptyLine: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowInfo: { flex: 1 },
  rowName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
});

export default ProductPickerModal;
