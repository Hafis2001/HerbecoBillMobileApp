/**
 * Payment Settings screen — Settings → Payment Settings.
 * Lets the owner save their UPI ID, merchant name, and optionally upload a
 * static bank QR image. All data is stored locally via AsyncStorage.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { usePaymentSettings } from '../../store/paymentSettingsStore';
import { showToast } from '../../components/Toast';
import PrimaryButton from '../../components/PrimaryButton';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function PaymentSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const { settings, saveSettings, clearSettings } = usePaymentSettings();

  const [upiId, setUpiId] = useState(settings?.upiId ?? '');
  const [merchantName, setMerchantName] = useState(settings?.merchantName ?? '');
  const [staticQrUri, setStaticQrUri] = useState<string | undefined>(settings?.staticQrUri);

  const hasChanges =
    upiId !== (settings?.upiId ?? '') ||
    merchantName !== (settings?.merchantName ?? '') ||
    staticQrUri !== settings?.staticQrUri;

  const pickQrImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setStaticQrUri(result.assets[0].uri);
    }
  };

  const onSave = () => {
    const trimmedUpi = upiId.trim();
    const trimmedName = merchantName.trim();

    if (!trimmedUpi && !staticQrUri) {
      showToast('Enter a UPI ID or upload a QR image', 'error');
      return;
    }
    if (trimmedUpi && !trimmedName) {
      showToast('Enter merchant / business name', 'error');
      return;
    }

    saveSettings({
      upiId: trimmedUpi,
      merchantName: trimmedName,
      staticQrUri,
    });
    showToast('Payment settings saved');
    router.back();
  };

  const onDelete = () => {
    Alert.alert(
      'Delete Payment Settings',
      'This will remove your UPI ID and QR image. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            clearSettings();
            setUpiId('');
            setMerchantName('');
            setStaticQrUri(undefined);
            showToast('Payment settings deleted');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.header, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* UPI Details */}
        <Text style={styles.sectionTitle}>UPI Details</Text>
        <View style={[styles.card, cardShadow]}>
          <View style={styles.field}>
            <Text style={styles.label}>UPI ID (VPA)</Text>
            <View style={styles.inputWrap}>
              <Feather name="credit-card" size={16} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                value={upiId}
                onChangeText={setUpiId}
                placeholder="e.g. merchant@upi"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>
            <Text style={styles.hint}>
              Customers scan and pay directly to this UPI ID. QR codes are generated offline.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Merchant / Business Name</Text>
            <View style={styles.inputWrap}>
              <Feather name="briefcase" size={16} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="e.g. HERBECO Store"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
            <Text style={styles.hint}>Shown on the payment QR screen and embedded in the QR code.</Text>
          </View>
        </View>

        {/* Static QR Image */}
        <Text style={styles.sectionTitle}>Static Bank QR (Optional)</Text>
        <View style={[styles.card, cardShadow]}>
          <Text style={styles.bodyText}>
            If your bank has given you a printed QR code, you can upload it here. It will be shown
            as-is — the payment amount won't be embedded (customers must enter it themselves).
          </Text>
          <Text style={[styles.bodyText, { marginTop: 4 }]}>
            If you've entered a UPI ID above, dynamic QR codes with the exact bill amount are
            generated instead.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.8 }]}
            onPress={pickQrImage}
            accessibilityRole="button"
            accessibilityLabel="Upload QR image"
          >
            <Feather name="upload" size={16} color={colors.primary} />
            <Text style={styles.uploadText}>
              {staticQrUri ? 'Replace QR Image' : 'Upload QR Image'}
            </Text>
          </Pressable>

          {staticQrUri ? (
            <View style={styles.qrPreview}>
              <Text style={styles.previewLabel}>QR Preview</Text>
              <Image source={{ uri: staticQrUri }} style={styles.qrImage} resizeMode="contain" />
              <Pressable
                onPress={() => setStaticQrUri(undefined)}
                style={styles.removeQr}
                accessibilityLabel="Remove QR image"
              >
                <Feather name="trash-2" size={14} color={colors.danger} />
                <Text style={styles.removeQrText}>Remove image</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Feather name="info" size={15} color={colors.gold} />
          <Text style={styles.infoText}>
            Dynamic QR codes are generated fully offline using the standard UPI URI format. No
            internet is needed. If you change the UPI ID, new bills get the updated details.
          </Text>
        </View>

        <PrimaryButton
          title="Save Payment Settings"
          onPress={onSave}
          disabled={!hasChanges && Boolean(settings)}
          icon="check"
          style={{ marginTop: spacing.md }}
        />

        {settings ? (
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel="Delete payment settings"
          >
            <Feather name="trash-2" size={15} color={colors.danger} />
            <Text style={styles.deleteText}>Delete Payment Settings</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  body: { paddingHorizontal: spacing.md },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  field: { marginBottom: spacing.md },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  inputIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
    padding: 0,
  },
  hint: {
    marginTop: 5,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 16,
  },
  bodyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    alignSelf: 'flex-start',
  },
  uploadText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  qrPreview: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  previewLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  qrImage: {
    width: 180,
    height: 180,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeQr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  removeQrText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.danger,
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
  infoText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
    lineHeight: 18,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  deleteText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.danger,
  },
});
