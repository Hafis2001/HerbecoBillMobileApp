/**
 * Add / edit a referral partner (Settings → Referrals).
 *
 * A bottom sheet that stays above the keyboard on every device: the form is
 * inside a KeyboardAvoidingView + ScrollView, and the sheet's padding follows
 * the safe-area inset so the buttons are never behind the system bar.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';
import { normalizeReferralCode } from '../store/referralDb';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import type { ReferralOwner } from '../types';
import PrimaryButton from './PrimaryButton';

const { colors, radius, spacing, fonts, fontSize } = theme;

const phoneRegex = /^[6-9]\d{9}$/;
const codeRegex = /^[A-Z0-9_-]{2,20}$/;

interface ReferralFormModalProps {
  visible: boolean;
  /** Partner being edited; null/undefined adds a new one. */
  initial?: ReferralOwner | null;
  onClose: () => void;
  /** Returns false when the ID is already used by another partner. */
  onSave: (values: { code: string; name: string; phone: string }) => Promise<boolean>;
}

export function ReferralFormModal({
  visible,
  initial,
  onClose,
  onSave,
}: ReferralFormModalProps) {
  const insets = useSafeAreaInsets();
  // The sheet slides up with the keyboard instead of hiding the Save button.
  const keyboardHeight = useKeyboardHeight();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the fields each time the sheet opens for a different partner.
  useEffect(() => {
    if (!visible) return;
    setCode(initial?.code ?? '');
    setName(initial?.name ?? '');
    setPhone(initial?.phone ?? '');
    setError(null);
    setSaving(false);
  }, [visible, initial]);

  const submit = async () => {
    const normalizedCode = normalizeReferralCode(code);
    const trimmedName = name.trim();

    if (!codeRegex.test(normalizedCode)) {
      setError('Referral ID must be 2–20 letters or numbers (e.g. RAJU01).');
      return;
    }
    if (!trimmedName) {
      setError('Enter the partner name.');
      return;
    }
    if (!phoneRegex.test(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ok = await onSave({ code: normalizedCode, name: trimmedName, phone });
      if (!ok) {
        setError(`Referral ID "${normalizedCode}" is already used by another partner.`);
        return;
      }
      onClose();
    } catch {
      setError('Could not save the referral. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheetWrap}>
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.md + keyboardHeight },
            ]}
          >
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {initial ? 'Edit referral' : 'New referral partner'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.85 }]}
              >
                <Feather name="x" size={18} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.form}
            >
              <Text style={styles.label}>Referral ID</Text>
              <View style={styles.inputWrap}>
                <Feather name="hash" size={16} color={colors.textMuted} />
                <TextInput
                  value={code}
                  onChangeText={(v) => {
                    setCode(v.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="RAJU01"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={20}
                  returnKeyType="next"
                />
              </View>
              <Text style={styles.help}>The ID the partner (or you) types at billing time.</Text>

              <Text style={[styles.label, styles.labelSpaced]}>Partner name</Text>
              <View style={styles.inputWrap}>
                <Feather name="user" size={16} color={colors.textMuted} />
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. Raju Kumar"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

              <Text style={[styles.label, styles.labelSpaced]}>Phone number</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v.replace(/\D/g, '').slice(0, 10));
                    if (error) setError(null);
                  }}
                  placeholder="9876543210"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  keyboardType="phone-pad"
                  maxLength={10}
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                />
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <PrimaryButton
                title={saving ? 'Saving…' : initial ? 'Save changes' : 'Add referral'}
                onPress={() => void submit()}
                disabled={saving}
                icon="check"
                style={styles.save}
              />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  backdropFill: { flex: 1 },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { paddingBottom: spacing.xs },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
  },
  labelSpaced: { marginTop: spacing.md },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
  },
  prefix: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  help: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 5,
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
  save: { marginTop: spacing.md },
});

export default ReferralFormModal;
