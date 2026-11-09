/**
 * Dashboard tab — sales insights from the saved bills.
 *
 * Daily / Weekly / Monthly / Yearly pick the period being reported: today,
 * this week, this month or this year. The KPI cards, the home-vs-referral
 * split and "Top moving items" all come from the saved bills in that period,
 * while the bar chart shows the recent trend (14 days, 8 weeks, 12 months or
 * 5 years). Every number is read from the local SQLite bills — nothing here
 * is sample data.
 *
 * The chart is drawn with plain Views (no chart library), so it stays inside
 * Expo Go and scales to any screen width. All the date maths lives in
 * utils/analytics.ts.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { EmptyState } from '../../components/EmptyState';
import { showToast } from '../../components/Toast';
import { getInvoiceRecords, getExpenses } from '../../store/invoiceDb';
import {
  compactINR,
  summarize,
  type AnalyticsRange,
} from '../../utils/analytics';
import { formatINR, formatQuantity } from '../../utils/format';
import { referralCommission } from '../../utils/pricing';
import type { Expense, InvoiceRecord } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const RANGES: Array<{ key: AnalyticsRange; label: string }> = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

const RANGE_NOTE: Record<AnalyticsRange, string> = {
  day: 'Last 14 days',
  week: 'Last 8 weeks',
  month: 'Last 12 months',
  year: 'Last 5 years',
};

export default function DashboardTab() {
  const insets = useSafeAreaInsets();
  const { width, isTablet, maxContentWidth } = useResponsive();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<AnalyticsRange>('day');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [invoiceData, expenseData] = await Promise.all([
        getInvoiceRecords(),
        getExpenses(),
      ]);
      setRecords(invoiceData);
      setExpenses(expenseData);
    } catch {
      showToast('Could not load sales data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const summary = useMemo(
    () => summarize(records, range, new Date(), expenses),
    [records, range, expenses],
  );

  const maxBucket = Math.max(...summary.buckets.map((b) => b.total), 1);
  // Narrower phones get a shorter chart so it still fits without scrolling, tablets get a taller one.
  const chartHeight = width < 360 ? 118 : isTablet ? 180 : 148;
  // Values above bars only when there is room for them.
  const showValues = range !== 'day';

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.header, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.titleRow}>
          <Ionicons name="bar-chart" size={21} color={colors.primary} />
          <Text style={styles.title}>Dashboard</Text>
        </View>
        <Text style={styles.subtitle}>Live totals from your saved bills</Text>
      </View>

      {/* Range filter */}
      <View style={[styles.filterRow, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        {RANGES.map((item) => {
          const active = range === item.key;
          return (
            <Text
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setRange(item.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              suppressHighlighting
            >
              {item.label}
            </Text>
          );
        })}
      </View>

      {records.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.emptyScroll, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
            />
          }
        >
          <EmptyState
            icon="bar-chart-2"
            title="No sales yet"
            subtitle="Generate your first bill and the charts here fill up automatically."
          />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
            />
          }
        >
          {/* KPI cards — 2 x 2 grid that stays even on narrow phones, 4-col on tablet.
              Daily/Weekly/Monthly/Yearly each report their own period, so the
              four filters never show the same numbers. */}
          <View style={styles.kpiHead}>
            <Text style={styles.kpiHeadTitle}>{summary.periodLabel}</Text>
            <Text style={styles.kpiHeadMeta}>
              {summary.bills} {summary.bills === 1 ? 'bill' : 'bills'}
            </Text>
          </View>
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, cardShadow, isTablet && { width: '23.5%' }]}>
              <Text style={styles.kpiLabel}>Sales</Text>
              <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(summary.sales)}
              </Text>
            </View>
            <View style={[styles.kpiCard, cardShadow, isTablet && { width: '23.5%' }]}>
              <Text style={styles.kpiLabel}>Bills</Text>
              <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
                {summary.bills}
              </Text>
            </View>
            <View style={[styles.kpiCard, cardShadow, isTablet && { width: '23.5%' }]}>
              <Text style={styles.kpiLabel}>Avg bill</Text>
              <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(summary.avgBill)}
              </Text>
            </View>
            <View style={[styles.kpiCard, cardShadow, isTablet && { width: '23.5%' }]}>
              <Text style={styles.kpiLabel}>Discounts</Text>
              <Text
                style={[styles.kpiValue, styles.kpiGold]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatINR(summary.discounts)}
              </Text>
            </View>
          </View>

          {/* Cash & Bank Balances */}
          <View style={styles.kpiHead}>
            <Text style={styles.kpiHeadTitle}>Cash & Bank Tracking ({summary.periodLabel})</Text>
          </View>
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, cardShadow]}>
              <View style={styles.cardHeaderSmall}>
                <Feather name="dollar-sign" size={14} color={colors.gold} />
                <Text style={styles.kpiLabel}>Cash in Hand</Text>
              </View>
              <Text
                style={[styles.kpiValue, summary.netCash < 0 && { color: colors.danger }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatINR(summary.netCash)}
              </Text>
              <Text style={styles.balanceSub}>
                +{formatINR(summary.cashSales)} in · -{formatINR(summary.cashExpenses)} out
              </Text>
            </View>
            <View style={[styles.kpiCard, cardShadow]}>
              <View style={styles.cardHeaderSmall}>
                <Feather name="credit-card" size={14} color={colors.primary} />
                <Text style={styles.kpiLabel}>Bank / UPI</Text>
              </View>
              <Text
                style={[styles.kpiValue, summary.netBank < 0 && { color: colors.danger }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatINR(summary.netBank)}
              </Text>
              <Text style={styles.balanceSub}>
                +{formatINR(summary.bankSales)} in · -{formatINR(summary.bankExpenses)} out
              </Text>
            </View>
          </View>

          {/* Net Profit & Expenses */}
          <View style={[styles.profitCard, cardShadow]}>
            <View style={styles.cardHead}>
              <View style={styles.profitHeadLeft}>
                <Feather
                  name={summary.netProfit >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={summary.netProfit >= 0 ? colors.primary : colors.danger}
                />
                <Text style={styles.cardTitle}>Net Profit ({summary.periodLabel})</Text>
              </View>
              <View
                style={[
                  styles.profitBadge,
                  { backgroundColor: summary.netProfit >= 0 ? colors.accentSoft : colors.dangerSoft },
                ]}
              >
                <Text
                  style={[
                    styles.profitBadgeText,
                    { color: summary.netProfit >= 0 ? colors.primary : colors.danger },
                  ]}
                >
                  {summary.netProfit >= 0 ? 'Profit' : 'Loss'}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.profitAmount,
                { color: summary.netProfit >= 0 ? colors.primary : colors.danger },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatINR(summary.netProfit)}
            </Text>

            <View style={styles.profitMetricsRow}>
              <View style={styles.profitMetricCol}>
                <Text style={styles.metricLabel}>Total Sales</Text>
                <Text style={styles.metricVal}>{formatINR(summary.sales)}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.profitMetricCol}>
                <Text style={styles.metricLabel}>Expenses</Text>
                <Text style={[styles.metricVal, { color: colors.danger }]}>
                  {formatINR(summary.totalExpenses)}
                </Text>
              </View>
            </View>
          </View>

          {summary.bills === 0 && summary.trendTotal > 0 ? (
            <Text style={styles.periodEmpty}>
              No bills {summary.periodLabel.toLowerCase()} yet — the chart below shows your
              trend.
            </Text>
          ) : null}

          {/* Bar chart */}
          <View style={[styles.chartCard, cardShadow]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Sales trend</Text>
              <Text style={styles.cardMeta}>{RANGE_NOTE[range]}</Text>
            </View>

            {summary.trendTotal === 0 ? (
              <View style={[styles.chartEmpty, { height: chartHeight }]}>
                <Feather name="trending-up" size={22} color={colors.textMuted} />
                <Text style={styles.chartEmptyText}>No sales in this period</Text>
              </View>
            ) : (
              <View style={[styles.chartArea, { height: chartHeight + 24 }]}>
                {summary.buckets.map((bucket, index) => {
                  const ratio = bucket.total / maxBucket;
                  const barHeight =
                    bucket.total > 0 ? Math.max(6, ratio * (chartHeight - 22)) : 2;
                  const isCurrent = index === summary.buckets.length - 1;
                  const hideLabel = range === 'week' && index % 2 === 1;
                  return (
                    <View key={bucket.key} style={styles.barCol}>
                      {showValues && bucket.total > 0 ? (
                        <Text style={styles.barValue} numberOfLines={1}>
                          {compactINR(bucket.total)}
                        </Text>
                      ) : null}
                      <View
                        style={[
                          styles.bar,
                          {
                            height: barHeight,
                            backgroundColor:
                              bucket.total > 0
                                ? isCurrent
                                  ? colors.primary
                                  : colors.accent
                                : colors.divider,
                          },
                        ]}
                      />
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {hideLabel ? '' : bucket.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Home vs referral split */}
          <View style={[styles.splitCard, cardShadow]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Home vs referral</Text>
              <Text style={styles.cardMeta}>{formatINR(summary.sales)} total</Text>
            </View>

            <SplitBar
              label="Home sales"
              value={summary.sales - summary.referralSales}
              total={summary.sales}
              color={colors.primary}
            />
            <SplitBar
              label="Referral sales"
              value={summary.referralSales}
              total={summary.sales}
              color={colors.gold}
            />
            {summary.referralSales > 0 ? (
              <Text style={styles.splitNote}>
                10% commission for partners: {formatINR(referralCommission(summary.referralSales))}
              </Text>
            ) : null}
          </View>

          {/* Top moving items */}
          <View style={[styles.topCard, cardShadow]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Top moving items</Text>
              <Text style={styles.cardMeta}>by revenue</Text>
            </View>

            {summary.topItems.length === 0 ? (
              <Text style={styles.topEmpty}>No products sold in this period.</Text>
            ) : (
              summary.topItems.map((item, index) => (
                <View key={`${item.name}-${item.unit}`} style={styles.topRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.topBody}>
                    <View style={styles.topLine}>
                      <Text style={styles.topName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.topRevenue}>{formatINR(item.revenue)}</Text>
                    </View>
                    <View style={styles.topTrack}>
                      <View
                        style={[
                          styles.topFill,
                          {
                            width: `${
                              summary.maxRevenue > 0
                                ? Math.max(4, (item.revenue / summary.maxRevenue) * 100)
                                : 4
                            }%` as `${number}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.topQty}>
                      {formatQuantity(item.quantity, item.unit)} sold
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** One labelled progress bar for the home/referral split. */
function SplitBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.max(0, (value / total) * 100) : 0;
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitTop}>
        <Text style={styles.splitLabel}>{label}</Text>
        <Text style={styles.splitValue}>{formatINR(value)}</Text>
      </View>
      <View style={styles.splitTrack}>
        <View
          style={[
            styles.splitFill,
            { width: `${Math.min(100, pct)}%` as `${number}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChip: {
    flex: 1,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    color: colors.textOnPrimary,
    fontFamily: fonts.semiBold,
  },
  emptyScroll: { flexGrow: 1 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  kpiHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
  },
  kpiHeadTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
  },
  kpiHeadMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  periodEmpty: {
    marginTop: spacing.xs,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  kpiCard: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
  },
  kpiLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  kpiValue: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.primary,
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceSub: {
    fontFamily: fonts.regular,
    fontSize: 9.5,
    color: colors.textMuted,
    marginTop: 4,
  },
  profitCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  profitHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profitBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  profitBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
  },
  profitAmount: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    marginVertical: spacing.xs,
  },
  profitMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  profitMetricCol: {
    flex: 1,
  },
  metricLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  metricVal: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.text,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.sm,
  },
  kpiGold: { color: colors.gold },
  chartCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    flexShrink: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
  },
  cardMeta: {
    flexShrink: 0,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barValue: {
    fontFamily: fonts.medium,
    fontSize: 7.5,
    color: colors.textMuted,
    marginBottom: 2,
  },
  bar: {
    width: '58%',
    maxWidth: 28,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabel: {
    marginTop: 5,
    fontFamily: fonts.regular,
    fontSize: 8,
    color: colors.textMuted,
  },
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  chartEmptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  splitCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  splitRow: { marginBottom: spacing.sm },
  splitTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 5,
  },
  splitLabel: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  splitValue: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  splitTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  splitFill: { height: '100%', borderRadius: radius.pill },
  splitNote: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.gold,
  },
  topCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  topEmpty: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm + 2,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  rankText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xs - 1,
    color: colors.primary,
  },
  topBody: { flex: 1 },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  topName: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs + 1,
    color: colors.text,
  },
  topRevenue: {
    flexShrink: 0,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.primary,
  },
  topTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
    overflow: 'hidden',
    marginTop: 5,
  },
  topFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  topQty: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
});
