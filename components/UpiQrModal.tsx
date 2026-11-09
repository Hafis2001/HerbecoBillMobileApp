/**
 * UpiQrModal — payment method selection (Cash / Bank / Split) + QR display.
 *
 * Shown on the Bill screen after the invoice is generated. The cashier picks
 * how the customer pays, optionally enters a split amount, then taps
 * "Payment Received" to confirm. This does NOT auto-confirm — payment
 * confirmation is always manual.
 *
 * If the merchant has a UPI ID saved, a dynamic QR is generated offline using
 * react-native-qrcode-svg with the exact bill amount embedded. If only a
 * static QR image is saved, that is shown instead.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import theme from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import { usePaymentSettings, buildUpiUri } from '../store/paymentSettingsStore';
import { formatINR } from '../utils/format';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface UpiQrModalProps {
  visible: boolean;
  invoiceNumber: string;
  grandTotal: number;
  onConfirm: (method: 'cash' | 'bank' | 'split', bankAmount: number, cashAmount: number) => void;
  onClose: () => void;
}

export default function UpiQrModal({
  visible,
  invoiceNumber,
  grandTotal,
  onConfirm,
  onClose,
}: UpiQrModalProps) {
  const insets = useSafeAreaInsets();
  const { width, isTablet } = useResponsive();
  const { settings } = usePaymentSettings();

  const [method, setMethod] = useState<'cash' | 'bank' | 'split'>('cash');
  const [bankText, setBankText] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  const bankAmount = parseFloat(bankText.replace(/[^0-9.]/g, '')) || 0;
  const cashAmount =
    method === 'split'
      ? Math.max(0, parseFloat((grandTotal - bankAmount).toFixed(2)))
      : method === 'cash'
        ? grandTotal
        : 0;
  const totalBankAmount = method === 'bank' ? grandTotal : method === 'split' ? bankAmount : 0;

  const upiUri =
    settings?.upiId
      ? buildUpiUri({
          upiId: settings.upiId,
          merchantName: settings.merchantName,
          amount: totalBankAmount > 0 ? totalBankAmount : grandTotal,
          billNumber: invoiceNumber,
        })
      : null;

  const hasPaymentConfig = Boolean(settings?.upiId || settings?.staticQrUri);
  const showBankSection = method === 'bank' || method === 'split';

  const handleConfirm = () => {
    const finalBank = method === 'bank' ? grandTotal : method === 'split' ? bankAmount : 0;
    const finalCash = method === 'cash' ? grandTotal : method === 'split' ? cashAmount : 0;
    onConfirm(method, finalBank, finalCash);
  };

  const splitInvalid = method === 'split' && (bankAmount <= 0 || bankAmount >= grandTotal);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.md },
          isTablet && {
            maxWidth: 500,
            left: Math.max(0, (width - 500) / 2),
            right: Math.max(0, (width - 500) / 2),
            borderRadius: radius.lg,
            bottom: 24,
          },
        ]}
      >
        <View style={styles.sheetHandle} />

        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Payment</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Total amount */}
          <View style={styles.amountBand}>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amountValue}>{formatINR(grandTotal)}</Text>
            <Text style={styles.amountSub}>Bill {invoiceNumber}</Text>
          </View>

          {/* Payment method selector */}
          <Text style={styles.sectionLabel}>Payment Method</Text>
          <View style={styles.methodRow}>
            {(['cash', 'bank', 'split'] as const).map((m) => (
              <Pressable
                key={m}
                style={[styles.methodBtn, method === m && styles.methodBtnActive]}
                onPress={() => { setMethod(m); setShowQr(false); }}
              >
                <Feather
                  name={m === 'cash' ? 'dollar-sign' : m === 'bank' ? 'credit-card' : 'git-merge'}
                  size={16}
                  color={method === m ? colors.textOnPrimary : colors.text}
                />
                <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
                  {m === 'cash' ? 'Cash' : m === 'bank' ? 'Bank / UPI' : 'Split'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Split amount input */}
          {method === 'split' ? (
            <View style={styles.splitSection}>
              <Text style={styles.fieldLabel}>Bank / UPI Amount (₹)</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  value={bankText}
                  onChangeText={setBankText}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.textInput}
                />
              </View>
              {bankAmount > 0 ? (
                <Text style={styles.splitBreakdown}>
                  Bank: {formatINR(bankAmount)} · Cash: {formatINR(cashAmount)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* QR section — only for bank or split */}
          {showBankSection && hasPaymentConfig ? (
            <View>
              {!showQr ? (
                <Pressable
                  style={[styles.showQrBtn, cardShadow]}
                  onPress={() => setShowQr(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Show QR code"
                >
                  <Feather name="maximize" size={18} color={colors.primary} />
                  <Text style={styles.showQrText}>Show QR Code</Text>
                </Pressable>
              ) : (
                <View style={styles.qrSection}>
                  <View style={styles.qrCard}>
                    {settings?.merchantName ? (
                      <Text style={styles.merchantName}>{settings.merchantName}</Text>
                    ) : null}
                    {settings?.upiId ? (
                      <Text style={styles.upiIdText}>{settings.upiId}</Text>
                    ) : null}

                    {upiUri ? (
                      <Pressable onPress={() => setEnlarged(true)} accessibilityLabel="Enlarge QR">
                        <View style={styles.qrWrap}>
                          <QRCode value={upiUri} size={180} />
                        </View>
                        <Text style={styles.qrHint}>Tap to enlarge</Text>
                      </Pressable>
                    ) : settings?.staticQrUri ? (
                      <Pressable onPress={() => setEnlarged(true)} accessibilityLabel="Enlarge QR">
                        <Image
                          source={{ uri: settings.staticQrUri }}
                          style={styles.staticQr}
                          resizeMode="contain"
                        />
                        <Text style={styles.qrHint}>
                          Static QR — customer must enter ₹{(totalBankAmount || grandTotal).toFixed(2)} manually
                        </Text>
                      </Pressable>
                    ) : null}

                    <Text style={styles.qrAmount}>{formatINR(totalBankAmount || grandTotal)}</Text>
                  </View>

                  <Pressable
                    style={styles.hideQrBtn}
                    onPress={() => setShowQr(false)}
                  >
                    <Feather name="x" size={14} color={colors.textMuted} />
                    <Text style={styles.hideQrText}>Hide QR</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : showBankSection && !hasPaymentConfig ? (
            <View style={styles.noQrBanner}>
              <Feather name="alert-circle" size={15} color={colors.gold} />
              <Text style={styles.noQrText}>
                No UPI ID configured. Go to Settings → Payment Settings to add one.
              </Text>
            </View>
          ) : null}

          {/* Confirm button */}
          <Pressable
            style={[
              styles.confirmBtn,
              splitInvalid && styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirm}
            disabled={splitInvalid}
            accessibilityRole="button"
            accessibilityLabel="Mark payment as received"
          >
            <Feather name="check-circle" size={18} color={colors.textOnPrimary} />
            <Text style={styles.confirmText}>Payment Received</Text>
          </Pressable>

          <Text style={styles.safetyNote}>
            Tap above only after verifying payment. QR display does not confirm payment.
          </Text>
        </ScrollView>
      </View>

      {/* Enlarged QR overlay */}
      <Modal visible={enlarged} animationType="fade" transparent onRequestClose={() => setEnlarged(false)}>
        <Pressable style={styles.enlargedScrim} onPress={() => setEnlarged(false)}>
          <View style={styles.enlargedCard}>
            {settings?.merchantName ? (
              <Text style={styles.enlargedMerchant}>{settings.merchantName}</Text>
            ) : null}
            {upiUri ? (
              <QRCode value={upiUri} size={260} />
            ) : settings?.staticQrUri ? (
              <Image source={{ uri: settings.staticQrUri }} style={styles.enlargedImg} resizeMode="contain" />
            ) : null}
            <Text style={styles.enlargedAmount}>{formatINR(totalBankAmount || grandTotal)}</Text>
            <Text style={styles.enlargedClose}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  amountBand: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  amountLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.accentSoft,
    letterSpacing: 0.5,
  },
  amountValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.textOnPrimary,
    marginTop: 4,
  },
  amountSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.accentSoft,
    marginTop: 2,
  },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  methodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 4,
  },
  methodBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.text,
  },
  methodTextActive: { color: colors.textOnPrimary },
  splitSection: { marginBottom: spacing.md },
  fieldLabel: {
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
    gap: 6,
  },
  rupee: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  textInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
    padding: 0,
  },
  splitBreakdown: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  showQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  showQrText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  qrSection: { marginBottom: spacing.md },
  qrCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  merchantName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: 2,
  },
  upiIdText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  qrWrap: {
    padding: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
  },
  staticQr: {
    width: 180,
    height: 180,
    borderRadius: radius.sm,
  },
  qrHint: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  qrAmount: {
    marginTop: spacing.sm,
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.primary,
  },
  hideQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
  },
  hideQrText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  noQrBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  noQrText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
    lineHeight: 18,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textOnPrimary,
  },
  safetyNote: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    lineHeight: 16,
  },

  // Enlarged overlay
  enlargedScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enlargedCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
  },
  enlargedMerchant: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  enlargedImg: { width: 260, height: 260, borderRadius: radius.sm },
  enlargedAmount: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.primary,
  },
  enlargedClose: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
