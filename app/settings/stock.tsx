/**
 * Settings → Stock Management.
 *
 * Dashboard of every stock item: KPI cards (total items, stock value,
 * low-stock and out-of-stock counts), search plus kind / status / category
 * filters, and one row per item with quick Restock and Edit actions.
 * Tapping a row opens its full ledger history.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { showToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';
import StockStatusBadge from '../../components/stock/StockStatusBadge';
import StockFormModal from '../../components/stock/StockFormModal';
import StockMovementModal from '../../components/stock/StockMovementModal';
import ProductLinksModal from '../../components/stock/ProductLinksModal';
import { getStockItems, summarizeStock } from '../../store/stockDb';
import { useProductStore } from '../../store/productStore';
import {
  displayUnitLabel,
  formatBaseQty,
  stockItemValue,
  stockStatusOf,
} from '../../utils/stock';
import { formatINR } from '../../utils/format';
import type { StockItem } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

type StatusFilter = 'all' | 'in' | 'low' | 'out';
type KindFilter = 'all' | 'material' | 'finished';

export default function StockManagementScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const products = useProductStore((s) => s.products);

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [restockItem, setRestockItem] = useState<StockItem | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setItems(await getStockItems());
    } catch {
      showToast('Could not load stock items', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const summary = useMemo(() => summarizeStock(items), [items]);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (statusFilter !== 'all' && stockStatusOf(item) !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [items, search, statusFilter, kindFilter, categoryFilter]);

  const openAdd = () => {
    setEditingItem(null);
    setFormOpen(true);
  };

  const openEdit = (item: StockItem) => {
    setEditingItem(item);
    setFormOpen(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Stock Management</Text>
          <Pressable
            onPress={() => setLinksOpen(true)}
            accessibilityLabel="Link products to stock"
            hitSlop={8}
            style={styles.headerIcon}
          >
            <Feather name="link-2" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={openAdd}
            accessibilityLabel="Add stock item"
            hitSlop={8}
            style={styles.headerIcon}
          >
            <Feather name="plus-circle" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or category…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search" hitSlop={8}>
              <Feather name="x" size={17} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <View>
              <View style={styles.kpiRow}>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={styles.kpiValue}>{summary.totalItems}</Text>
                  <Text style={styles.kpiLabel}>Stock items</Text>
                </View>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={[styles.kpiValue, { color: colors.primary }]}>
                    {formatINR(summary.totalValue)}
                  </Text>
                  <Text style={styles.kpiLabel}>Stock value</Text>
                </View>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={[styles.kpiValue, { color: colors.gold }]}>{summary.lowCount}</Text>
                  <Text style={styles.kpiLabel}>Low stock</Text>
                </View>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={[styles.kpiValue, { color: colors.danger }]}>{summary.outCount}</Text>
                  <Text style={styles.kpiLabel}>Out of stock</Text>
                </View>
              </View>

              <View style={styles.filterRow}>
                {(
                  [
                    ['all', 'All', 'list'],
                    ['material', 'Materials', 'package'],
                    ['finished', 'Finished', 'gift'],
                  ] as Array<[KindFilter, string, keyof typeof Feather.glyphMap]>
                ).map(([key, label, icon]) => {
                  const active = kindFilter === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setKindFilter(key)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Feather
                        name={icon}
                        size={13}
                        color={active ? colors.textOnPrimary : colors.textMuted}
                      />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.filterRow}>
                {(
                  [
                    ['all', 'Any status'],
                    ['in', 'In stock'],
                    ['low', 'Low'],
                    ['out', 'Out'],
                  ] as Array<[StatusFilter, string]>
                ).map(([key, label]) => {
                  const active = statusFilter === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setStatusFilter(key)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {categories.length > 2 ? (
                <View style={styles.filterRow}>
                  {categories.map((cat) => {
                    const active = categoryFilter === cat;
                    return (
                      <Pressable
                        key={cat}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setCategoryFilter(cat)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {cat === 'all' ? 'All categories' : cat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : items.length === 0 ? (
              <EmptyState
                icon="box"
                title="No stock items yet"
                subtitle="Add the materials you buy — coffee, bottles, labels — and track every restock, production use and sale."
                actionLabel="Add stock item"
                onAction={openAdd}
              />
            ) : (
              <Text style={styles.emptyText}>No stock item matches those filters.</Text>
            )
          }
          renderItem={({ item }) => {
            const status = stockStatusOf(item);
            return (
              <View style={[styles.row, cardShadow]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open history for ${item.name}`}
                  style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
                  onPress={() =>
                    router.push({ pathname: '/settings/stock-history', params: { itemId: item.id } })
                  }
                >
                  <View style={styles.nameRow}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <StockStatusBadge status={status} />
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {formatBaseQty(item.balance, item.unitType, item.displayUnit)} on hand · {item.category}
                    {item.kind === 'finished' ? ' · Produced in-house' : ''}
                  </Text>
                  {item.purchasePrice ? (
                    <Text style={styles.rowPrice}>
                      {formatINR(stockItemValue(item))} in stock · {formatINR(item.purchasePrice)} per{' '}
                      {displayUnitLabel(item.displayUnit)}
                    </Text>
                  ) : null}
                </Pressable>
                <View style={styles.rowActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Restock ${item.name}`}
                    onPress={() => setRestockItem(item)}
                    style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Feather name="plus" size={17} color={colors.textOnPrimary} />
                    <Text style={styles.actionBtnText}>Restock</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.name}`}
                    onPress={() => openEdit(item)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Feather name="edit-2" size={17} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>

      <StockFormModal
        visible={formOpen}
        editing={editingItem}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />

      <StockMovementModal
        visible={restockItem !== null}
        mode="restock"
        item={restockItem}
        onClose={() => setRestockItem(null)}
        onSaved={() => void reload()}
      />

      <ProductLinksModal
        visible={linksOpen}
        products={products}
        stockItems={items}
        onClose={() => setLinksOpen(false)}
        onSaved={() => void reload()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mainWrap: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  headerIcon: { minWidth: 28, alignItems: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs + 2,
    alignItems: 'center',
  },
  kpiValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  kpiLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    minHeight: 34,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  chipTextActive: { color: colors.textOnPrimary, fontFamily: fonts.semiBold },
  loadingWrap: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  rowBody: { flex: 1 },
  rowPressed: { opacity: 0.85 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowMeta: {
    marginTop: 3,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  rowPrice: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  actionBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.textOnPrimary,
  },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
