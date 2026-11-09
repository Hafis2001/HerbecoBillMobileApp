/**
 * Settings tab — the last tab in the app.
 *
 * Two separate pages live behind it: Products (add / edit / delete catalogue
 * items) and Referral partners (each has a referral ID, a name and a phone
 * number; bills made with that ID credit the partner 10%).
 */

import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { showToast } from '../../components/Toast';
import { getReferralOwners } from '../../store/referralDb';
import { getReferralStats } from '../../store/invoiceDb';
import { useProductStore } from '../../store/productStore';
import { usePaymentSettings } from '../../store/paymentSettingsStore';
import { formatINR } from '../../utils/format';
import type { ReferralOwner, ReferralStat } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  meta: string;
  onPress: () => void;
}

function SettingsRow({ icon, title, meta, onPress }: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, cardShadow, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Feather name={icon} size={19} color={colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsTab() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const products = useProductStore((s) => s.products);
  const [owners, setOwners] = useState<ReferralOwner[]>([]);
  const [stats, setStats] = useState<Record<string, ReferralStat>>({});
  const paymentSettings = usePaymentSettings((s) => s.settings);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const [list, referralStats] = await Promise.all([
            getReferralOwners(),
            getReferralStats(),
          ]);
          if (cancelled) return;
          setOwners(list);
          setStats(referralStats);
        } catch {
          if (!cancelled) showToast('Could not load settings', 'error');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const totalEarned = Object.values(stats).reduce((sum, s) => sum + s.earned, 0);
  const productCount = products.length;
  const partnerCount = owners.length;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.header, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.titleRow}>
          <Feather name="sliders" size={20} color={colors.primary} />
          <Text style={styles.title}>Settings</Text>
        </View>
        <Text style={styles.subtitle}>Manage your catalogue and referral partners</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsRow
          icon="package"
          title="Products"
          meta={
            productCount === 0
              ? 'No products yet — add your first one'
              : `${productCount} ${productCount === 1 ? 'product' : 'products'} · add, edit or remove items`
          }
          onPress={() => router.push('/settings/products')}
        />

        <SettingsRow
          icon="users"
          title="Referral partners"
          meta={
            partnerCount === 0
              ? 'No partners yet — add a referral ID'
              : `${partnerCount} ${partnerCount === 1 ? 'partner' : 'partners'} · ${formatINR(
                  totalEarned,
                )} earned at 10%`
          }
          onPress={() => router.push('/settings/referrals')}
        />

        <SettingsRow
          icon="credit-card"
          title="Payment Settings"
          meta={
            paymentSettings?.upiId
              ? `UPI: ${paymentSettings.upiId} · ${paymentSettings.merchantName || 'No name set'}`
              : paymentSettings?.staticQrUri
                ? 'Static QR image saved'
                : 'No payment method configured yet'
          }
          onPress={() => router.push('/settings/payment')}
        />

        <SettingsRow
          icon="minus-circle"
          title="Expenses"
          meta="Track cash and bank expenses — reflects on the dashboard"
          onPress={() => router.push('/settings/expenses')}
        />

        <View style={styles.infoCard}>
          <Feather name="info" size={16} color={colors.gold} />
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>Prices, units and photos live with each product</Text>
            <Text style={styles.infoText}>
              Anything you change here shows up on the Home and Referral grids, and on every bill
              you create next.
            </Text>
          </View>
        </View>
      </ScrollView>
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
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  rowPressed: { opacity: 0.85 },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 17,
  },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    marginTop: spacing.sm,
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
