/**
 * Settings → Referral partners.
 *
 * The list stays short on purpose: each partner shows their name, referral ID
 * and the commission earned so far. Tapping a partner opens the full ledger —
 * every commission with its purchase date, amount breakdown and a paid toggle.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { showToast } from '../../components/Toast';
import ReferralFormModal from '../../components/ReferralFormModal';
import { EmptyState } from '../../components/EmptyState';
import { getReferralOwners, saveReferralOwner } from '../../store/referralDb';
import { getReferralStats } from '../../store/invoiceDb';
import { formatINR } from '../../utils/format';
import type { ReferralOwner, ReferralStat } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function SettingsReferralsScreen() {
  const insets = useSafeAreaInsets();
  const [owners, setOwners] = useState<ReferralOwner[]>([]);
  const [stats, setStats] = useState<Record<string, ReferralStat>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [topOnly, setTopOnly] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [list, referralStats] = await Promise.all([getReferralOwners(), getReferralStats()]);
      setOwners(list);
      setStats(referralStats);
    } catch {
      showToast('Could not load referral partners', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /** The partner with the highest earnings (null while nobody has earned). */
  const topCode = useMemo(() => {
    let code: string | null = null;
    let best = 0;
    for (const owner of owners) {
      const earned = stats[owner.code]?.earned ?? 0;
      if (earned > best) {
        best = earned;
        code = owner.code;
      }
    }
    return code;
  }, [owners, stats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return owners.filter((owner) => {
      if (topOnly && owner.code !== topCode) return false;
      if (!q) return true;
      return (
        owner.name.toLowerCase().includes(q) || owner.code.toLowerCase().includes(q)
      );
    });
  }, [owners, search, topOnly, topCode]);

  const handleSave = async (values: { code: string; name: string; phone: string }) => {
    const ok = await saveReferralOwner(values);
    if (!ok) return false;
    showToast('Referral partner added');
    await reload();
    return true;
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Referral partners</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add referral partner"
          onPress={() => setFormOpen(true)}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
        >
          <Feather name="plus" size={15} color={colors.textOnPrimary} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or referral ID…"
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

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !topOnly }}
            onPress={() => setTopOnly(false)}
            style={[styles.chip, !topOnly && styles.chipActive]}
          >
            <Text style={[styles.chipText, !topOnly && styles.chipTextActive]}>All partners</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: topOnly }}
            onPress={() => setTopOnly(true)}
            style={[styles.chip, topOnly && styles.chipActive]}
          >
            <Feather
              name="award"
              size={13}
              color={topOnly ? colors.textOnPrimary : colors.textMuted}
            />
            <Text style={[styles.chipText, topOnly && styles.chipTextActive]}>Top earner</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : owners.length === 0 ? (
          <EmptyState
            icon="users"
            title="No referral partners yet"
            subtitle="Add a partner with their referral ID and phone number. Bills made with that ID credit them 10%."
            actionLabel="Add referral partner"
            onAction={() => setFormOpen(true)}
          />
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>
            {topOnly && !topCode
              ? 'No commissions earned yet — make a referral sale first.'
              : topOnly
                ? 'The top earner does not match that search.'
                : 'No partner matches that search.'}
          </Text>
        ) : (
          filtered.map((owner) => {
            const stat = stats[owner.code];
            const isTop = owner.code === topCode;
            return (
              <Pressable
                key={owner.code}
                accessibilityRole="button"
                accessibilityLabel={`Open ${owner.name}, ${owner.code}, earned ${formatINR(
                  stat?.earned ?? 0,
                )}`}
                onPress={() =>
                  router.push({
                    pathname: '/settings/referral-detail',
                    params: { code: owner.code },
                  })
                }
                style={({ pressed }) => [styles.row, cardShadow, pressed && styles.rowPressed]}
              >
                <View style={styles.rowBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {owner.name}
                    </Text>
                    {isTop ? (
                      <View style={styles.topBadge}>
                        <Feather name="award" size={10} color={colors.gold} />
                        <Text style={styles.topBadgeText}>Top</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rowCode}>ID: {owner.code}</Text>
                </View>

                <View style={styles.earnedBox}>
                  <Text style={styles.earnedValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatINR(stat?.earned ?? 0)}
                  </Text>
                  <Text style={styles.earnedLabel}>Earned</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <ReferralFormModal
        visible={formOpen}
        initial={null}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  addBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textOnPrimary,
  },
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
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  rowPressed: { opacity: 0.85 },
  rowBody: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: {
    flexShrink: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowCode: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  topBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 9,
    color: colors.gold,
    letterSpacing: 0.4,
  },
  earnedBox: { alignItems: 'flex-end', maxWidth: 108 },
  earnedValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.gold,
  },
  earnedLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
});
