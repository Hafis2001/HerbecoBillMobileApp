/**
 * Settings → Referral partners → one partner.
 *
 * The full ledger: every bill that partner brought in, the purchase date, the
 * bill amount and the 10% commission on it. Each commission can be marked paid
 * (or back to unpaid) as the owner settles up.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { showToast } from '../../components/Toast';
import ReferralFormModal from '../../components/ReferralFormModal';
import EmptyState from '../../components/EmptyState';
import {
  deleteReferralOwner,
  getReferralOwners,
  saveReferralOwner,
} from '../../store/referralDb';
import { getReferralCommissions, setCommissionPaid } from '../../store/invoiceDb';
import { useReferralSession } from '../../store/referralSession';
import { formatINR } from '../../utils/format';
import type { ReferralCommissionLine, ReferralOwner } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

/** "05 Nov 2026" — the day the customer bought. */
const formatPurchaseDate = (ms: number): string =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ms));

export default function ReferralDetailScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = params.code ?? '';
  const insets = useSafeAreaInsets();

  const [partner, setPartner] = useState<ReferralOwner | null>(null);
  const [lines, setLines] = useState<ReferralCommissionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeCode = useReferralSession((s) => s.active?.code ?? null);

  const load = useCallback(async () => {
    try {
      const [owners, commissions] = await Promise.all([
        getReferralOwners(),
        code ? getReferralCommissions(code) : Promise.resolve([]),
      ]);
      setPartner(owners.find((o) => o.code === code) ?? null);
      setLines(commissions);
    } catch {
      showToast('Could not load this partner', 'error');
      setPartner(null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const totalEarned = lines.reduce((sum, line) => sum + line.commission, 0);
  const totalPaid = lines.filter((l) => l.paid).reduce((sum, l) => sum + l.commission, 0);
  const totalPending = totalEarned - totalPaid;

  const togglePaid = async (line: ReferralCommissionLine) => {
    if (busyId) return;
    setBusyId(line.id);
    try {
      await setCommissionPaid(line.id, !line.paid);
      const fresh = await getReferralCommissions(code);
      setLines(fresh);
      showToast(
        line.paid
          ? `Marked ${line.number} commission unpaid`
          : `Commission on ${line.number} marked paid`,
      );
    } catch {
      showToast('Could not update the commission', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (values: { code: string; name: string; phone: string }) => {
    const ok = await saveReferralOwner(values, partner?.code);
    if (!ok) return false;
    if (activeCode && partner && activeCode === partner.code) {
      useReferralSession.getState().setActive({
        code: values.code,
        name: values.name,
        phone: values.phone,
        createdAtMs: partner.createdAtMs,
      });
    }
    showToast('Referral updated');
    setFormOpen(false);
    if (values.code !== partner?.code) {
      // The ID changed, so this page's own key changed with it.
      router.replace({ pathname: '/settings/referral-detail', params: { code: values.code } });
    } else {
      setPartner({ ...(partner as ReferralOwner), ...values });
    }
    return true;
  };

  const confirmDelete = () => {
    if (!partner) return;
    Alert.alert(
      'Delete referral partner?',
      `${partner.name} (${partner.code}) will be removed. Bills already saved keep their history and commission.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteReferralOwner(partner.code);
                if (activeCode === partner.code) useReferralSession.getState().clearActive();
                showToast('Referral removed');
                router.back();
              } catch {
                showToast('Could not remove the referral', 'error');
              }
            })();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!partner) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <Ionicons name="person-remove-outline" size={38} color={colors.danger} />
          <Text style={styles.missingTitle}>Partner not found</Text>
          <Text style={styles.missingText}>It may have been deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {partner.name}
          </Text>
          <Text style={styles.headerMeta}>{partner.code}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${partner.name}`}
          onPress={() => setFormOpen(true)}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="edit-2" size={18} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${partner.name}`}
          onPress={confirmDelete}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="trash-2" size={18} color={colors.danger} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, cardShadow]}>
          <View style={styles.partnerTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {partner.name.trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName} numberOfLines={1}>
                {partner.name}
              </Text>
              <Text style={styles.partnerPhone}>+91 {partner.phone}</Text>
            </View>
            <View style={styles.codeChip}>
              <Text style={styles.codeText}>{partner.code}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Earned 10%</Text>
              <Text style={[styles.statValue, styles.statGold]} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(totalEarned)}
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Paid</Text>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(totalPaid)}
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Pending</Text>
              <Text style={[styles.statValue, styles.statPending]} numberOfLines={1} adjustsFontSizeToFit>
                {formatINR(totalPending)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Commissions ({lines.length})</Text>

        {lines.length === 0 ? (
          <EmptyState
            icon="award"
            title="No commissions yet"
            subtitle={`Bills made with the ID ${partner.code} on the Referral tab appear here with their 10%.`}
          />
        ) : (
          lines.map((line) => (
            <View key={line.id} style={[styles.lineCard, cardShadow]}>
              <View style={styles.lineTop}>
                <View style={styles.lineInfo}>
                  <Text style={styles.lineDate}>{formatPurchaseDate(line.purchaseMs)}</Text>
                  <Text style={styles.lineBill}>Bill {line.number}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: line.paid }}
                  accessibilityLabel={
                    line.paid
                      ? `Mark commission on ${line.number} as not paid`
                      : `Mark commission on ${line.number} as paid`
                  }
                  onPress={() => void togglePaid(line)}
                  disabled={busyId === line.id}
                  style={({ pressed }) => [
                    styles.paidBtn,
                    line.paid && styles.paidBtnPaid,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {busyId === line.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Feather
                        name={line.paid ? 'check-circle' : 'circle'}
                        size={13}
                        color={line.paid ? colors.textOnPrimary : colors.textMuted}
                      />
                      <Text style={[styles.paidBtnText, line.paid && styles.paidBtnTextPaid]}>
                        {line.paid ? 'Paid' : 'Not paid'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={styles.breakdown}>
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel}>Bill amount</Text>
                  <Text style={styles.breakdownValue}>{formatINR(line.billAmount)}</Text>
                </View>
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel}>Commission @ 10%</Text>
                  <Text style={[styles.breakdownValue, styles.breakdownGold]}>
                    {formatINR(line.commission)}
                  </Text>
                </View>
              </View>

              <Text style={styles.lineFootnote}>
                {line.paid
                  ? `Marked paid${line.paidAtMs ? ` on ${formatPurchaseDate(line.paidAtMs)}` : ''}`
                  : 'Not settled yet'}
              </Text>
            </View>
          ))
        )}

        <View style={styles.infoCard}>
          <Feather name="info" size={16} color={colors.gold} />
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>Commission is 10% of each referral bill</Text>
            <Text style={styles.infoText}>
              It is worked out bill by bill, so the rows above always add up to the earned total.
              Mark a row paid once you have handed over that amount.
            </Text>
          </View>
        </View>
      </ScrollView>

      <ReferralFormModal
        visible={formOpen}
        initial={partner}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  missingTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  missingText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  headerMeta: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  headerBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  partnerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  partnerInfo: { flex: 1 },
  partnerName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  partnerPhone: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  codeChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  codeText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  statCol: { flex: 1 },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  statValue: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
    marginTop: 2,
  },
  statGold: { color: colors.gold },
  statPending: { color: colors.danger },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  lineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineInfo: { flex: 1 },
  lineDate: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  lineBill: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  paidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  paidBtnPaid: { backgroundColor: colors.primary, borderColor: colors.primary },
  paidBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  paidBtnTextPaid: { color: colors.textOnPrimary },
  breakdown: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  breakdownCol: { flex: 1 },
  breakdownLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  breakdownValue: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginTop: 1,
  },
  breakdownGold: { color: colors.gold },
  lineFootnote: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  infoBody: { flex: 1 },
  infoTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 4,
  },
  infoText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
    lineHeight: 18,
  },
});
