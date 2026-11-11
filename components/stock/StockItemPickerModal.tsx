/**
 * Searchable picker for stock items, used when picking ingredients for
 * recipes or linking billing products to stock. Shows each item's
 * balance in its own measurement unit and its category.
 */

import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { displayUnitLabel, formatBaseQty, fromBaseQty } from '../../utils/stock';
import type { StockItem } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface StockItemPickerModalProps {
  visible: boolean;
  items: StockItem[];
  /** Ids to hide from the list (already picked, for example). */
  excludeIds?: string[];
  title: string;
  onClose: () => void;
  onPick: (item: StockItem) => void;
}

export function StockItemPickerModal({
  visible,
  items,
  excludeIds,
  title,
  onClose,
  onPick,
}: StockItemPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const pool = useMemo(
    () => (excludeIds && excludeIds.length > 0 ? items.filter((i) => !excludeIds.includes(i.id)) : items),
    [items, excludeIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q),
    );
  }, [pool, search]);

  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.wrap}>
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
              placeholder="Search stock items…"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoFocus
            />
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.emptyLine}>
              {pool.length === 0
                ? 'No stock items available — add them in Stock Management first.'
                : 'No stock item matches that search.'}
            </Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.id}
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
                      {item.category} · {formatBaseQty(item.balance, item.unitType, item.displayUnit)} in stock
                    </Text>
                  </View>
                  <Feather name="plus-circle" size={20} color={colors.primary} />
                </Pressable>
              )}
            />
          )}
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

export default StockItemPickerModal;
