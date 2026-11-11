/**
 * Stock item history — Settings → Stock Management → item.
 *
 * Summary card with the current balance and status, Restock / Adjust
 * buttons, and the full ledger: every opening, restock, adjustment,
 * production use, production output, sale and sale reversal with the
 * quantity change, the balance after and any bill / batch reference.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import StockStatusBadge from '../../components/stock/StockStatusBadge';
import StockMovementModal from '../../components/stock/StockMovementModal';
import { getStockItem, getStockTransactions } from '../../store/stockDb';
import {
  formatBaseQty,
  formatQtyChange,
  stockStatusOf,
} from '../../utils/stock';
import { formatDateTime } from '../../utils/format';
import type { StockItem, StockTransaction, StockTransactionType } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const TXN_LABEL: Record<StockTransactionType, string> = {
  opening: 'Opening stock',
  restock: 'Restock',
  adjust: 'Adjustment',
  production_use: 'Used in production',
  production_out: 'Produced',
  sale: 'Sale',
  sale_reversal: 'Sale cancelled',
};

const TXN_ICON: Record<StockTransactionType, keyof typeof Feather.glyphMap> = {
  opening: 'flag',
  restock: 'plus-circle',
  adjust: 'shuffle',
  production_use: 'tool',
  production_out: 'gift',
  sale: 'shopping-bag',
  sale_reversal: 'rotate-ccw',
};

export default function StockHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();

  const [item, setItem] = useState<StockItem | null>(null);
  const [txns, setTxns] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [restockOpen, setRestockOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!itemId) return;
    try {
      const [loadedItem, loadedTxns] = await Promise.all([
        getStockItem(itemId),
        getStockTransactions(itemId),
      ]);
      if (!loadedItem) {
        showToast('That stock item no longer exists', 'error');
        router.back();
        return;
      }
      setItem(loadedItem);
      setTxns(loadedTxns);
    } catch {
      showToast('Could not load the stock history', 'error');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {item ? item.name : 'Stock history'}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={txns}
            keyExtractor={(t) => t.id}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <View style={[styles.summaryCard, cardShadow]}>
                  <View style={styles.summaryTop}>
                    <View>
                      <Text style={styles.balanceValue}>
                        {formatBaseQty(item?.balance ?? 0, item?.unitType ?? 'weight', item?.displayUnit)}
                      </Text>
                      <Text style={styles.balanceLabel}>
                        {item?.category ?? ''}
                        {item?.kind === 'finished' ? ' · Produced in-house' : ''}
                      </Text>
                    </View>
                    {item ? <StockStatusBadge status={stockStatusOf(item)} /> : null}
                  </View>
                  {item && item.minQtyBase > 0 ? (
                    <Text style={styles.minLine}>
                      Low-stock alert at {formatBaseQty(item.minQtyBase, item.unitType, item.displayUnit)}
                    </Text>
                  ) : null}
                  <View style={styles.actionRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setRestockOpen(true)}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Feather name="plus" size={16} color={colors.textOnPrimary} />
                      <Text style={styles.actionBtnText}>Restock</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setAdjustOpen(true)}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        styles.adjustBtn,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Feather name="shuffle" size={16} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Adjust</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>History</Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No movements recorded yet — use Restock to add stock, or Adjust to correct the balance.
              </Text>
            }
            renderItem={({ item: txn }) => {
              const positive = txn.qtyChange > 0;
              return (
                <View style={[styles.txnRow, cardShadow]}>
                  <View
                    style={[
                      styles.txnIcon,
                      { backgroundColor: positive ? colors.accentSoft : colors.goldSoft },
                    ]}
                  >
                    <Feather
                      name={TXN_ICON[txn.type]}
                      size={16}
                      color={positive ? colors.primary : colors.gold}
                    />
                  </View>
                  <View style={styles.txnBody}>
                    <Text style={styles.txnTitle}>{TXN_LABEL[txn.type]}</Text>
                    <Text style={styles.txnMeta}>
                      {formatDateTime(new Date(txn.createdAtMs).toISOString())}
                      {txn.refType === 'bill' && txn.refId ? ` · Bill ${txn.refId}` : ''}
                      {txn.refType === 'batch' && txn.refId ? ` · Batch ${txn.refId}` : ''}
                      {txn.supplier ? ` · ${txn.supplier}` : ''}
                    </Text>
                    {txn.note ? (
                      <Text style={styles.txnNote} numberOfLines={2}>
                        {txn.note}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.txnRight}>
                    <Text style={[styles.txnQty, positive && { color: colors.primary }]}>
                      {formatQtyChange(txn.qtyChange, item?.unitType ?? 'weight', item?.displayUnit)}
                    </Text>
                    <Text style={styles.txBalance}>
                      {formatBaseQty(txn.balanceAfter, item?.unitType ?? 'weight', item?.displayUnit)} after
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      <StockMovementModal
        visible={restockOpen}
        mode="restock"
        item={item}
        onClose={() => setRestockOpen(false)}
        onSaved={() => void reload()}
      />
      <StockMovementModal
        visible={adjustOpen}
        mode="adjust"
        item={item}
        onClose={() => setAdjustOpen(false)}
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
  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  balanceValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  balanceLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  minLine: {
    marginTop: spacing.xs,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    minHeight: 40,
  },
  adjustBtn: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textOnPrimary,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnBody: { flex: 1 },
  txnTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  txnMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  txnNote: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  txnRight: { alignItems: 'flex-end', maxWidth: 110 },
  txnQty: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  txBalance: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
});
