/**
 * Referral ID gate — shown on the Referral tab until a partner is chosen.
 *
 * The owner types the referral ID saved in Settings → Referrals. A match shows
 * the partner's name and unlocks referral billing for them; a wrong ID shows
 * a clear error. The X closes the gate and goes back to Home.
 */

import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { findReferralOwner, normalizeReferralCode } from '../store/referralDb';
import type { ReferralOwner } from '../types';
import PrimaryButton from './PrimaryButton';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface ReferralIdScreenProps {
  /** Closes the gate (X) and leaves the referral flow. */
  onClose: () => void;
  /** Called with the matched partner. */
  onActivated: (owner: ReferralOwner) => void;
}

export function ReferralIdScreen({ onClose, onActivated }: ReferralIdScreenProps) {
  const insets = useSafeAreaInsets();
  // Keeps Continue reachable above the keyboard on edge-to-edge Android too.
  const keyboardHeight = useKeyboardHeight();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    const normalized = normalizeReferralCode(code);
    if (!normalized) {
      setError('Enter a referral ID to continue.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const owner = await findReferralOwner(normalized);
      if (!owner) {
        setError(`No referral found for "${normalized}". Add it in Settings → Referrals.`);
        return;
      }
      onActivated(owner);
    } catch {
      setError('Could not check the referral ID. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>Referral</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close referral ID"
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
        >
          <Feather name="x" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + spacing.xl + keyboardHeight },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.badgeWrap}>
            <View style={styles.badge}>
              <Feather name="users" size={26} color={colors.primary} />
            </View>
          </View>

          <Text style={styles.title}>Enter referral ID</Text>
          <Text style={styles.subtitle}>
            Type the ID of the referral partner this sale belongs to. The partner gets 10%
            of the bill — the customer's own name and number are entered in the cart as
            usual.
          </Text>

          <View style={[styles.card, cardShadow]}>
            <Text style={styles.label}>Referral ID</Text>
            <View style={[styles.inputWrap, Boolean(error) && styles.inputWrapError]}>
              <Feather name="hash" size={17} color={colors.textMuted} />
              <TextInput
                value={code}
                onChangeText={(value) => {
                  setCode(value.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="e.g. RAJU01"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                maxLength={24}
              />
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={14} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <PrimaryButton
              title={checking ? 'Checking…' : 'Continue'}
              onPress={() => void submit()}
              disabled={checking}
              icon="arrow-right"
              style={styles.submit}
            />
            {checking ? (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.spinner}
              />
            ) : null}
          </View>

          <View style={styles.hintCard}>
            <Feather name="info" size={15} color={colors.gold} />
            <Text style={styles.hintText}>
              New partner? Add their ID, name and number in Settings → Referrals first.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancelRow}
            hitSlop={8}
          >
            <Text style={styles.cancelText}>Cancel and go back</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  badgeWrap: { alignItems: 'center', marginBottom: spacing.md },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  subtitle: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  inputWrapError: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    letterSpacing: 1,
    color: colors.text,
    padding: 0,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  submit: { marginTop: spacing.md },
  spinner: { marginTop: spacing.sm },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginTop: spacing.md,
  },
  hintText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  cancelRow: { alignItems: 'center', marginTop: spacing.lg },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});

export default ReferralIdScreen;
