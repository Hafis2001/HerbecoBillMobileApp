/**
 * Bills tab — every generated bill is saved here (local SQLite) with a
 * "Pending" or "Uploaded" status. Bills are kept until the owner deletes
 * them: there is no automatic expiry, so old bills still export.
 *
 * The list is compact: one short card per bill, grouped under the day it was
 * billed, with the five actions as small buttons on a single row. The date
 * filter accepts the quick ranges, one specific day, or a From – To range, and
 * "Download Excel" exports exactly the bills in view.
 */

import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { showToast } from '../../components/Toast';
import DateFilterSheet, { type DateFilterValue } from '../../components/DateFilterSheet';
import { deleteInvoice, getInvoiceRecords, setInvoiceStatus } from '../../store/invoiceDb';
import { shareInvoiceOnWhatsApp, shareInvoicePdf } from '../../utils/pdf';
import { exportBillsToCsv } from '../../utils/excel';
import { formatINR, formatINRShort } from '../../utils/format';
import type { Invoice, InvoiceRecord } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

type RangeKey = 'all' | 'today' | '7d' | '30d' | 'month' | 'year';

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

/** Epoch ms for the first moment of the selected range (null = no limit). */
function rangeStart(key: RangeKey): number | null {
  if (key === 'all') return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case 'today':
      return start.getTime();
    case '7d':
      start.setDate(start.getDate() - 6);
      return start.getTime();
    case '30d':
      start.setDate(start.getDate() - 29);
      return start.getTime();
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'year':
      return new Date(now.getFullYear(), 0, 1).getTime();
    default:
      return null;
  }
}

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const endOfDay = (ms: number): number => startOfDay(ms) + 86400000 - 1;

/** "05 Nov 2026" */
const formatDay = (ms: number): string =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(ms),
  );

/** "05 Nov" */
const formatDayShort = (ms: number): string =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(ms));

/** "3:45 PM" */
const formatTime = (ms: number): string =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).format(
    new Date(ms),
  );

/** Section title for a day: Today / Yesterday / "Wed, 05 Nov 2026". */
function dayHeading(ms: number): string {
  const today = startOfDay(Date.now());
  const day = startOfDay(ms);
  if (day === today) return 'Today';
  if (day === today - 86400000) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ms));
}

interface BillSection {
  key: string;
  title: string;
  count: number;
  total: number;
  data: InvoiceRecord[];
}

interface ActionButtonProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  busy?: boolean;
}

/** One compact action on the bill row: icon over a 9px label. */
function ActionButton({ icon, label, color, accessibilityLabel, onPress, busy }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <>
          <Feather name={icon} size={15} color={color} />
          <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export default function BillsTab() {
  const { isTablet, maxContentWidth } = useResponsive();
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyNumber, setBusyNumber] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await getInvoiceRecords());
    } catch {
      showToast('Could not load saved bills', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const filtered = useMemo(() => {
    const start = dateFilter ? startOfDay(dateFilter.fromMs) : rangeStart(range);
    const end = dateFilter ? endOfDay(dateFilter.toMs) : null;
    return records
      .filter((r) => {
        if (start !== null && r.createdAtMs < start) return false;
        if (end !== null && r.createdAtMs > end) return false;
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [records, range, dateFilter]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? 'All';
  const dateLabel = dateFilter
    ? dateFilter.mode === 'single' || dateFilter.fromMs === dateFilter.toMs
      ? formatDay(dateFilter.fromMs)
      : `${formatDayShort(dateFilter.fromMs)} – ${formatDayShort(dateFilter.toMs)}`
    : null;
  const filterLabel = dateFilter
    ? dateFilter.mode === 'single' || dateFilter.fromMs === dateFilter.toMs
      ? formatDay(dateFilter.fromMs)
      : `${formatDay(dateFilter.fromMs)} to ${formatDay(dateFilter.toMs)}`
    : range === 'all'
      ? 'all'
      : rangeLabel;

  const filteredTotal = filtered.reduce((sum, r) => sum + r.grandTotal, 0);
  const pendingCount = filtered.filter((r) => r.status === 'pending').length;

  const sections = useMemo<BillSection[]>(() => {
    const byDay = new Map<string, BillSection>();
    for (const record of filtered) {
      const key = new Date(startOfDay(record.createdAtMs)).toISOString();
      const section = byDay.get(key) ?? {
        key,
        title: dayHeading(record.createdAtMs),
        count: 0,
        total: 0,
        data: [],
      };
      section.count += 1;
      section.total += record.grandTotal;
      section.data.push(record);
      byDay.set(key, section);
    }
    return [...byDay.values()];
  }, [filtered]);

  const recordToInvoice = (r: InvoiceRecord): Invoice => ({
    number: r.number,
    type: r.type,
    customer: { name: r.customerName, phone: r.customerPhone },
    items: r.items,
    subtotal: r.subtotal,
    discount: r.discount,
    gst: r.gst,
    grandTotal: r.grandTotal,
    createdAt: new Date(r.createdAtMs).toISOString(),
    referral:
      r.referralCode && r.referralName
        ? { code: r.referralCode, name: r.referralName }
        : undefined,
  });

  const guard = async (r: InvoiceRecord, action: () => Promise<void>) => {
    setBusyNumber(r.number);
    try {
      await action();
    } catch {
      showToast('Something went wrong, try again', 'error');
    } finally {
      setBusyNumber(null);
    }
  };

  const onSharePdf = (r: InvoiceRecord) =>
    guard(r, async () => {
      await shareInvoicePdf(recordToInvoice(r));
    });

  const onShareWhatsApp = (r: InvoiceRecord) =>
    guard(r, () => {
      void shareInvoiceOnWhatsApp(recordToInvoice(r));
      return Promise.resolve();
    });

  const onToggleUploaded = (r: InvoiceRecord) =>
    guard(r, async () => {
      const next = r.status === 'uploaded' ? 'pending' : 'uploaded';
      await setInvoiceStatus(r.id, next);
      showToast(next === 'uploaded' ? 'Marked as uploaded' : 'Marked back as pending');
      void reload();
    });

  const onDelete = (r: InvoiceRecord) => {
    Alert.alert(
      'Delete this bill?',
      `${r.number} (${formatINRShort(r.grandTotal)}) will be removed from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void guard(r, async () => {
              await deleteInvoice(r.id);
              showToast('Bill deleted');
              void reload();
            }),
        },
      ],
    );
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await exportBillsToCsv(filtered, filterLabel);
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({ item }: { item: InvoiceRecord }) => {
    const uploaded = item.status === 'uploaded';
    return (
      <View style={[styles.card, cardShadow]}>
        <View style={styles.cardTop}>
          <Text style={styles.billNumber}>{item.number}</Text>
          <View style={[styles.statusChip, uploaded ? styles.statusUploaded : styles.statusPending]}>
            <Text
              style={[styles.statusText, uploaded ? styles.statusTextUploaded : styles.statusTextPending]}
            >
              {uploaded ? 'Uploaded' : 'Pending'}
            </Text>
          </View>
          <Text style={styles.total} numberOfLines={1}>
            {formatINRShort(item.grandTotal)}
          </Text>
        </View>

        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.customerName} · {item.items.length} item{item.items.length === 1 ? '' : 's'} ·{' '}
          {formatTime(item.createdAtMs)}
          {item.discount > 0 ? ` · Discount ${formatINRShort(item.discount)}` : ''}
        </Text>

        <View style={styles.actions}>
          <ActionButton
            icon="message-circle"
            label="WhatsApp"
            color={colors.primary}
            accessibilityLabel={`Send ${item.number} on WhatsApp`}
            onPress={() => void onShareWhatsApp(item)}
            busy={busyNumber === item.number}
          />
          <ActionButton
            icon="share-2"
            label="PDF"
            color={colors.primary}
            accessibilityLabel={`Share ${item.number} PDF`}
            onPress={() => void onSharePdf(item)}
          />
          <ActionButton
            icon="edit-2"
            label="Edit"
            color={colors.primary}
            accessibilityLabel={`Edit ${item.number}`}
            onPress={() => router.push({ pathname: '/edit-bill', params: { id: item.id } })}
          />
          <ActionButton
            icon={uploaded ? 'rotate-ccw' : 'check-circle'}
            label={uploaded ? 'Undo' : 'Upload'}
            color={uploaded ? colors.textMuted : colors.gold}
            accessibilityLabel={`Mark ${item.number} as ${uploaded ? 'pending' : 'uploaded'}`}
            onPress={() => void onToggleUploaded(item)}
          />
          <ActionButton
            icon="trash-2"
            label="Delete"
            color={colors.danger}
            accessibilityLabel={`Delete ${item.number}`}
            onPress={() => onDelete(item)}
          />
        </View>
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: BillSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionMeta} numberOfLines={1}>
        {section.count} bill{section.count === 1 ? '' : 's'} · {formatINRShort(section.total)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.header, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.titleRow}>
          <Feather name="file-text" size={21} color={colors.primary} />
          <Text style={styles.title}>Bills & Sales</Text>
        </View>
        <Text style={styles.subtitle}>
          Saved bills stay until you delete them · filter by any date or range
        </Text>
      </View>

      <View style={[styles.filterWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled"
        >
          {RANGES.map((item) => {
            const active = !dateFilter && range === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setDateFilter(null);
                  setRange(item.key);
                }}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick a specific date or a date range"
            accessibilityState={{ selected: Boolean(dateFilter) }}
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [
              styles.filterChip,
              styles.dateChip,
              dateFilter && styles.filterChipActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather
              name="calendar"
              size={13}
              color={dateFilter ? colors.textOnPrimary : colors.primary}
            />
            <Text style={[styles.filterText, dateFilter && styles.filterTextActive]}>
              {dateLabel ?? 'Date'}
            </Text>
            {dateFilter ? (
              <Pressable
                onPress={() => setDateFilter(null)}
                hitSlop={10}
                accessibilityLabel="Clear the date filter"
              >
                <Feather name="x" size={13} color={colors.textOnPrimary} />
              </Pressable>
            ) : (
              <Feather name="chevron-down" size={13} color={colors.primary} />
            )}
          </Pressable>
        </ScrollView>
      </View>

      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : records.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No bills yet"
            subtitle="Every bill you generate is saved here with a Pending status until you mark it Uploaded."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No bills for this date"
            subtitle="Try another day, a From – To range, or one of the quick filters."
            actionLabel="Reset filter"
            onAction={() => {
              setDateFilter(null);
              setRange('all');
            }}
          />
        ) : (
          <>
            <View style={styles.toolbar}>
              <View style={styles.toolbarLeft}>
                <Text style={styles.toolbarText} numberOfLines={1}>
                  {filtered.length} bill{filtered.length === 1 ? '' : 's'} ·{' '}
                  {dateFilter ? dateLabel : rangeLabel}
                  {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
                </Text>
                <Text style={styles.toolbarTotal}>{formatINR(filteredTotal)}</Text>
              </View>
              <PrimaryButton
                title={exporting ? '…' : `Excel (${filtered.length})`}
                small
                icon="download"
                onPress={() => void onExport()}
                disabled={exporting}
              />
            </View>

            <SectionList
              sections={sections}
              keyExtractor={(r) => r.id}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </View>

      <View style={[styles.footerWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <PrimaryButton
          title="Refresh list"
          variant="ghost"
          small
          icon="refresh-cw"
          onPress={() => void reload()}
        />
      </View>

      <DateFilterSheet
        visible={sheetOpen}
        initial={dateFilter}
        onClose={() => setSheetOpen(false)}
        onApply={(value) => {
          setDateFilter(value);
          if (value) setRange('all');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mainWrap: { flex: 1 },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
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
  filterWrap: { paddingTop: spacing.xs },
  filterRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  dateChip: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  filterTextActive: { color: colors.textOnPrimary },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs,
  },
  toolbarLeft: { flex: 1 },
  toolbarText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  toolbarTotal: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs + 2,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionMeta: {
    flexShrink: 0,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  billNumber: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPending: { backgroundColor: colors.goldSoft },
  statusUploaded: { backgroundColor: colors.accentSoft },
  statusText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    letterSpacing: 0.4,
  },
  statusTextPending: { color: colors.gold },
  statusTextUploaded: { color: colors.primary },
  total: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: fontSize.md + 1,
    color: colors.primary,
  },
  cardMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 5,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionPressed: { opacity: 0.7 },
  actionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    letterSpacing: 0.2,
  },
  footerWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 4,
    alignItems: 'center',
  },
});
