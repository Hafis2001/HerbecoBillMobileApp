/**
 * Production home — top-level route pushed from Settings / Dashboard.
 *
 * KPI cards (batches, units produced, recipes), the two main actions
 * (produce a batch / manage recipes), the finished-goods inventory with
 * produced / sold / available per recipe, and the recent production
 * batches. Everything is read from the local stock database.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { showToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';
import StockStatusBadge from '../../components/stock/StockStatusBadge';
import {
  getFinishedGoods,
  getProductionBatches,
  getProductionSummary,
  syncRecipeBillingProducts,
  type FinishedGoodsRow,
} from '../../store/stockDb';
import { formatBaseQty, displayUnitSingle } from '../../utils/stock';
import { formatDateTime, formatINR } from '../../utils/format';
import type { ProductionBatch } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const RECENT_BATCH_LIMIT = 10;

export default function ProductionHomeScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();

  const [summary, setSummary] = useState({ batchCount: 0, unitsProduced: 0, recipeCount: 0 });
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodsRow[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      await syncRecipeBillingProducts().catch(() => {});
      const [prodSummary, goods, batchList] = await Promise.all([
        getProductionSummary(),
        getFinishedGoods(),
        getProductionBatches(),
      ]);
      setSummary(prodSummary);
      setFinishedGoods(goods);
      setBatches(batchList);
    } catch {
      showToast('Could not load production data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const recentBatches = batches.slice(0, RECENT_BATCH_LIMIT);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Production</Text>
          <Pressable
            onPress={() => router.push('/production/recipes')}
            accessibilityLabel="Manage recipes"
            hitSlop={8}
            style={styles.headerIcon}
          >
            <Feather name="list" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <FlatList
          data={finishedGoods}
          keyExtractor={(g) => g.recipe.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <View style={styles.kpiRow}>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={styles.kpiValue}>{summary.batchCount}</Text>
                  <Text style={styles.kpiLabel}>Batches made</Text>
                </View>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={[styles.kpiValue, { color: colors.primary }]}>
                    {summary.unitsProduced}
                  </Text>
                  <Text style={styles.kpiLabel}>Units produced</Text>
                </View>
                <View style={[styles.kpiCard, cardShadow]}>
                  <Text style={[styles.kpiValue, { color: colors.gold }]}>{summary.recipeCount}</Text>
                  <Text style={styles.kpiLabel}>Recipes</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/production/create')}
                  style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.85 }]}
                >
                  <Feather name="play-circle" size={18} color={colors.textOnPrimary} />
                  <Text style={styles.primaryActionText}>Create Production</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/production/recipes')}
                  style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.85 }]}
                >
                  <Feather name="book-open" size={17} color={colors.primary} />
                  <Text style={styles.secondaryActionText}>Manage Recipes</Text>
                </Pressable>
              </View>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : finishedGoods.length > 0 ? (
                <Text style={styles.sectionTitle}>Finished goods in stock</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            loading ? undefined : (
              <EmptyState
                icon="tool"
                title="No production yet"
                subtitle="Create a recipe with the materials it uses, then produce batches — materials are deducted and finished stock is added automatically."
                actionLabel="Manage recipes"
                onAction={() => router.push('/production/recipes')}
              />
            )
          }
          renderItem={({ item: good }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open history for ${good.recipe.name}`}
              onPress={() =>
                router.push({
                  pathname: '/settings/stock-history',
                  params: { itemId: good.item.id },
                })
              }
              style={({ pressed }) => [styles.row, cardShadow, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {good.recipe.name}
                  </Text>
                  <StockStatusBadge status={good.status} />
                </View>
                <Text style={styles.rateLine} numberOfLines={1}>
                  Rate: {formatINR(good.recipe.price || 0)} per {displayUnitSingle(good.recipe.finishedUnit)}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {formatBaseQty(good.item.balance, good.item.unitType, good.item.displayUnit)} available ·{' '}
                  {formatBaseQty(good.producedBase, good.item.unitType, good.item.displayUnit)} produced ·{' '}
                  {formatBaseQty(good.soldBase, good.item.unitType, good.item.displayUnit)} sold
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Produce ${good.recipe.name}`}
                onPress={() =>
                  router.push({
                    pathname: '/production/create',
                    params: { recipeId: good.recipe.id },
                  })
                }
                style={({ pressed }) => [styles.produceSmallBtn, pressed && { opacity: 0.85 }]}
              >
                <Feather name="play" size={12} color={colors.textOnPrimary} />
                <Text style={styles.produceSmallBtnText}>Produce</Text>
              </Pressable>
            </Pressable>
          )}
          ListFooterComponent={
            recentBatches.length > 0 ? (
              <View style={styles.batchesSection}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Recent batches</Text>
                  {batches.length > RECENT_BATCH_LIMIT ? (
                    <Text style={styles.sectionMeta}>{batches.length} total</Text>
                  ) : null}
                </View>
                {recentBatches.map((batch) => (
                  <Pressable
                    key={batch.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open batch ${batch.batchNo}`}
                    onPress={() =>
                      router.push({
                        pathname: '/production/batch',
                        params: { batchNo: batch.batchNo },
                      })
                    }
                    style={({ pressed }) => [styles.row, cardShadow, pressed && { opacity: 0.85 }]}
                  >
                    <View style={styles.rowBody}>
                      <View style={styles.nameRow}>
                        <Text style={styles.batchNo}>{batch.batchNo}</Text>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {batch.recipeName}
                        </Text>
                      </View>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {batch.quantity} {batch.finishedUnit === 'kg' ? 'kg' : 'pcs'} ·{' '}
                        {formatDateTime(new Date(batch.createdAtMs).toISOString())}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ) : undefined
          }
        />
      </View>
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    minHeight: 46,
  },
  primaryActionText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textOnPrimary,
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 46,
  },
  secondaryActionText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  loadingWrap: { paddingVertical: spacing.lg, alignItems: 'center' },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginBottom: spacing.sm,
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
  rateLine: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  batchNo: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xs,
    color: colors.primary,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  rowMeta: {
    marginTop: 3,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  batchesSection: { marginTop: spacing.md },
  produceSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.sm,
  },
  produceSmallBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textOnPrimary,
  },
});
