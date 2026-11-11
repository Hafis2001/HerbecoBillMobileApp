/**
 * Production → Batch detail (read-only).
 *
 * What was produced, when, the batch number and the frozen recipe
 * snapshot: every material consumed with its quantity — exactly as it
 * was recorded at production time, even if the recipe changed later.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { showToast } from '../../components/Toast';
import { getProductionBatch } from '../../store/stockDb';
import { displayUnitLabel, formatBaseQty } from '../../utils/stock';
import { formatDateTime } from '../../utils/format';
import type { ProductionBatch } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function ProductionBatchScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const { batchNo } = useLocalSearchParams<{ batchNo?: string }>();

  const [batch, setBatch] = useState<ProductionBatch | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!batchNo) return;
    try {
      const loaded = await getProductionBatch(batchNo);
      if (!loaded) {
        showToast('That batch no longer exists', 'error');
        router.back();
        return;
      }
      setBatch(loaded);
    } catch {
      showToast('Could not load the batch', 'error');
    } finally {
      setLoading(false);
    }
  }, [batchNo]);

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
          <Text style={styles.headerTitle}>
            {batch ? `Batch ${batch.batchNo}` : 'Production batch'}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : batch ? (
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.summaryCard, cardShadow]}>
              <View style={styles.summaryTop}>
                <Feather name="package" size={20} color={colors.primary} />
                <Text style={styles.recipeName} numberOfLines={1}>
                  {batch.recipeName}
                </Text>
              </View>
              <Text style={styles.quantityLine}>
                Produced{' '}
                <Text style={styles.quantityStrong}>
                  {batch.quantity} {displayUnitLabel(batch.finishedUnit || 'pieces')}
                </Text>
              </Text>
              <Text style={styles.metaLine}>
                {formatDateTime(new Date(batch.createdAtMs).toISOString())} · Batch {batch.batchNo}
              </Text>
              {batch.notes ? <Text style={styles.notes}>{batch.notes}</Text> : null}
            </View>

            <Text style={styles.sectionTitle}>Materials used</Text>
            <View style={[styles.materialsCard, cardShadow]}>
              {batch.snapshot.map((line) => (
                <View key={line.stockItemId} style={styles.materialRow}>
                  <View style={styles.materialDot} />
                  <Text style={styles.materialName} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={styles.materialQty}>
                    {formatBaseQty(line.usedBase, line.unitType, line.unitLabel)}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.snapshotNote}>
              Quantities are the recipe as it was at production time — later recipe
              edits do not change this batch.
            </Text>
          </ScrollView>
        ) : null}
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
  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  recipeName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  quantityLine: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  quantityStrong: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  metaLine: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  notes: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  materialsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  materialDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  materialName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  materialQty: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  snapshotNote: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
});
