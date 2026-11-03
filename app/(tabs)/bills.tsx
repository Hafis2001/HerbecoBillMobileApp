/**
 * Bills tab — every generated bill is saved here (local SQLite) with a
 * "Pending" or "Uploaded" status. Bills older than 30 days are removed
 * automatically. Each bill can be re-shared (PDF and/or WhatsApp) from here.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import theme from '../../constants/theme';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import { showToast } from '../../components/Toast';
import {
  deleteInvoice,
  getInvoiceRecords,
  purgeExpiredInvoices,
  setInvoiceStatus,
} from '../../store/invoiceDb';
import { getInvoicePdfUri, shareInvoiceOnWhatsApp, shareInvoicePdf } from '../../utils/pdf';
import { formatINRShort, formatDateTime } from '../../utils/format';
import type { Invoice, InvoiceRecord } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const RETENTION_DAYS = 30;

export default function BillsTab() {
  const [records, setRecords] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyNumber, setBusyNumber] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const purged = await purgeExpiredInvoices(RETENTION_DAYS);
      if (purged > 0) showToast(`${purged} bill(s) older than 30 days deleted`);
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

  const recordToInvoice = (r: InvoiceRecord): Invoice => ({
    number: r.number,
    type: r.type,
    customer: { name: r.customerName, phone: r.customerPhone },
    items: r.items,
    subtotal: r.subtotal,
    gst: r.gst,
    grandTotal: r.grandTotal,
    createdAt: new Date(r.createdAtMs).toISOString(),
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
    Alert.alert('Delete this bill?', `${r.number} (${formatINRShort(r.grandTotal)}) will be removed from this device.`, [
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
    ]);
  };

  const renderItem = ({ item }: { item: InvoiceRecord }) => (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.cardTop}>
        <Image source={require('../../assets/logo.png')} style={styles.cardLogo} resizeMode="contain" />
        <View style={styles.cardHeader}>
          <Text style={styles.billNumber}>{item.number}</Text>
          <Text style={styles.billDate}>{formatDateTime(new Date(item.createdAtMs).toISOString())}</Text>
        </View>
        <View
          style={[
            styles.statusChip,
            item.status === 'uploaded' ? styles.statusUploaded : styles.statusPending,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              item.status === 'uploaded' ? styles.statusTextUploaded : styles.statusTextPending,
            ]}
          >
            {item.status === 'uploaded' ? 'Uploaded' : 'Pending'}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoCol}>
          <Text style={styles.customerName}>{item.customerName}</Text>
          <Text style={styles.customerPhone}>+91 {item.customerPhone}</Text>
          <Text style={styles.itemCount}>
            {item.items.length} item{item.items.length === 1 ? '' : 's'}
            {item.type === 'referral' ? ' · Referral +10%' : ''}
          </Text>
        </View>
        <Text style={styles.total}>{formatINRShort(item.grandTotal)}</Text>
      </View>

      {/* Two rows of two equal buttons. A single row of four overflowed on
          narrow phones, which pushed the delete button out of line. */}
      <View style={styles.actions}>
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share ${item.number} on WhatsApp`}
            onPress={() => void onShareWhatsApp(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnPrimary,
              pressed && styles.actionPressed,
            ]}
          >
            {busyNumber === item.number ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <>
                <Ionicons name="chatbubble-ellipses" size={17} color={colors.textOnPrimary} />
                <Text
                  style={[styles.actionLabel, styles.actionLabelPrimary]}
                  numberOfLines={1}
                >
                  WhatsApp
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Share ${item.number} PDF`}
            onPress={() => void onSharePdf(item)}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
          >
            <Feather name="share-2" size={17} color={colors.primary} />
            <Text style={styles.actionLabel} numberOfLines={1}>
              Share PDF
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.number} as ${item.status === 'uploaded' ? 'pending' : 'uploaded'}`}
            onPress={() => void onToggleUploaded(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              item.status === 'uploaded' && styles.actionBtnMuted,
              pressed && styles.actionPressed,
            ]}
          >
            <Feather
              name={item.status === 'uploaded' ? 'rotate-ccw' : 'check-circle'}
              size={17}
              color={item.status === 'uploaded' ? colors.textMuted : colors.primary}
            />
            <Text
              style={[
                styles.actionLabel,
                item.status === 'uploaded' && styles.actionLabelMuted,
              ]}
              numberOfLines={1}
            >
              {item.status === 'uploaded' ? 'Undo upload' : 'Mark uploaded'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.number}`}
            onPress={() => onDelete(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.actionBtnDanger,
              pressed && styles.actionPressed,
            ]}
          >
            <Feather name="trash-2" size={17} color={colors.danger} />
            <Text style={[styles.actionLabel, styles.actionLabelDanger]} numberOfLines={1}>
              Delete
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="receipt" size={22} color={colors.primary} />
          <Text style={styles.title}>Bills & Sales</Text>
        </View>
        <Text style={styles.subtitle}>
          Bills older than {RETENTION_DAYS} days are deleted automatically
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : records.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="No bills yet"
          subtitle="Every bill you generate is saved here for 30 days with a Pending status until you mark it Uploaded."
        />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>
              {records.length} saved bill{records.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.summaryText}>
              {records.filter((r) => r.status === 'pending').length} pending
            </Text>
          </View>
          <FlatList
            data={records}
            keyExtractor={(r) => r.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <View style={styles.footerWrap}>
        <PrimaryButton
          title="Refresh list"
          variant="ghost"
          small
          icon="refresh-cw"
          onPress={() => void reload()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  summaryText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
  },
  cardHeader: {
    flex: 1,
    marginLeft: spacing.sm + 2,
  },
  billNumber: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
  },
  billDate: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
  statusChip: {
    flexShrink: 0,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPending: {
    backgroundColor: colors.goldSoft,
  },
  statusUploaded: {
    backgroundColor: colors.accent,
  },
  statusText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    letterSpacing: 0.5,
  },
  statusTextPending: {
    color: colors.gold,
  },
  statusTextUploaded: {
    color: colors.textOnPrimary,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  infoCol: { flex: 1 },
  customerName: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  customerPhone: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  itemCount: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 3,
  },
  total: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.primary,
  },
  actions: {
    marginTop: spacing.sm + 4,
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
  },
  actionBtnMuted: {
    backgroundColor: colors.divider,
  },
  actionBtnDanger: {
    backgroundColor: colors.dangerSoft,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionLabel: {
    flexShrink: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  actionLabelPrimary: {
    color: colors.textOnPrimary,
  },
  actionLabelMuted: {
    color: colors.textMuted,
  },
  actionLabelDanger: {
    color: colors.danger,
  },
  footerWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 4,
  },
});
