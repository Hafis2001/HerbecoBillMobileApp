/**
 * Bill screen — invoice preview, professional PDF generation (expo-print),
 * WhatsApp greeting and PDF sharing, plus "New Sale" to clear the cart.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';
import { BUSINESS } from '../utils/billTemplate';
import { amountInWords, formatDateTime, formatINR, formatQuantity } from '../utils/format';
import {
  getInvoicePdfUri,
  showWhatsAppGuide,
  shareInvoiceOnWhatsApp,
  shareInvoicePdf,
} from '../utils/pdf';
import { saveInvoice } from '../store/invoiceDb';
import { useHomeCart } from '../store/homeCartStore';
import { useReferralCart } from '../store/referralCartStore';
import type { Invoice, CartType } from '../types';
import { PrimaryButton } from '../components/PrimaryButton';
import { showToast } from '../components/Toast';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function BillScreen() {
  const params = useLocalSearchParams<{ data?: string; type?: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (typeof params.data === 'string') {
      try {
        setInvoice(JSON.parse(params.data) as Invoice);
      } catch {
        setInvoice(null);
      }
    }
  }, [params.data]);

  const type: CartType = invoice?.type ?? (params.type === 'referral' ? 'referral' : 'home');

  // Persist the bill to local SQLite (Bills tab) and generate/cache the PDF.
  useEffect(() => {
    if (!invoice || pdfReady) return;
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          saveInvoice(invoice).catch((e) => {
            console.log('saveInvoice error', e);
            showToast('Could not save the bill history', 'error');
            return null;
          }),
          getInvoicePdfUri(invoice).catch((e) => {
            console.log('getInvoicePdfUri error', e);
            throw e;
          }),
        ]);
      } catch (e) {
        console.log('PDF generation failed', e);
        if (!cancelled) showToast('Could not generate the PDF', 'error');
      } finally {
        if (!cancelled) setPdfReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invoice, pdfReady]);

  const shareOnWhatsApp = async () => {
    if (!invoice) return;
    await shareInvoiceOnWhatsApp(invoice);
  };

  const sharePdf = async () => {
    if (!invoice) return;
    try {
      await shareInvoicePdf(invoice);
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  /** Clears THIS flow's cart and returns to the home tab. */
  const newSale = () => {
    if (type === 'referral') useReferralCart.getState().clearCart();
    else useHomeCart.getState().clearCart();
    showToast('Cart cleared — ready for a new sale');
    router.dismissAll();
    router.replace('/(tabs)');
  };

  if (!invoice) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.missingWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text style={styles.missingTitle}>No bill to show</Text>
          <Text style={styles.missingSub}>Generate a bill from a cart first.</Text>
          <PrimaryButton title="Go to Home" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.dismissTo('/(tabs)')}
          accessibilityLabel="Back to cart"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Bill {invoice.number}</Text>
        {pdfReady ? (
          <Ionicons name="document-text" size={21} color={colors.primary} />
        ) : (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>

      {/* In-app invoice preview (mirrors the PDF layout) */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand band */}
        <View style={styles.brandBand}>
          <View style={styles.bandLeft}>
            <View style={styles.logoPlate}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="HERBECO"
              />
            </View>
          </View>
          <View style={styles.bandRight}>
            <Text style={styles.bandText} numberOfLines={2}>{BUSINESS.address}</Text>
            <Text style={styles.bandText}>{BUSINESS.phone}</Text>
            <Text style={styles.bandText}>GSTIN: {BUSINESS.gstin}</Text>
          </View>
        </View>

        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.docTitle}>TAX INVOICE</Text>
          {invoice.type === 'referral' ? (
            <View style={styles.flowBadge}>
              <Text style={styles.flowBadgeText}>REFERRAL SALE (+10%)</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            Invoice No: <Text style={styles.metaStrong}>{invoice.number}</Text>
          </Text>
          <Text style={styles.metaText}>
            Date: <Text style={styles.metaStrong}>{formatDateTime(invoice.createdAt)}</Text>
          </Text>
        </View>

        {/* Billed to */}
        <View style={styles.billedCard}>
          <Text style={styles.billedLabel}>BILLED TO</Text>
          <Text style={styles.billedName}>{invoice.customer.name}</Text>
          <Text style={styles.billedSub}>+91 {invoice.customer.phone}</Text>
        </View>

        {/* Items */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 1.6 }]}>Item</Text>
          <Text style={[styles.th, { textAlign: 'center' }]}>Qty</Text>
          <Text style={[styles.th, styles.thRight]}>Rate</Text>
          <Text style={[styles.th, styles.thRight]}>Amount</Text>
        </View>
        {invoice.items.map((item, i) => (
          <View key={item.productId} style={[styles.tableRow, i % 2 === 0 && styles.tableRowEven]}>
            <Text style={styles.tdName} numberOfLines={2}>
              {item.name}
              <Text style={styles.tdUnit}> · {item.unit === 'kg' ? 'by weight' : 'by unit'}</Text>
            </Text>
            <Text style={[styles.td, { textAlign: 'center' }]}>
              {formatQuantity(item.quantity, item.unit)}
            </Text>
            <Text style={[styles.td, styles.thRight]}>{formatINR(item.unitPrice)}</Text>
            <Text style={[styles.td, styles.strong, styles.thRight]}>
              {formatINR(item.unitPrice * item.quantity)}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatINR(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST (5%)</Text>
            <Text style={styles.totalValue}>{formatINR(invoice.gst)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandValue}>{formatINR(invoice.grandTotal)}</Text>
          </View>
        </View>

        <View style={styles.wordsCard}>
          <Text style={styles.wordsText}>
            Amount in words: <Text style={styles.wordsStrong}>{amountInWords(invoice.grandTotal)}</Text>
          </Text>
        </View>

        <View style={styles.signWrap}>
          <View style={styles.signLine} />
          <Text style={styles.signText}>For {BUSINESS.name}</Text>
        </View>

        <Text style={styles.thanks}>Thank you for purchasing from HERBECO 🌿</Text>
        <Text style={styles.generatedNote}>This is a computer generated invoice.</Text>

        {/* Two-step WhatsApp hint */}
        <Pressable onPress={showWhatsAppGuide} style={styles.hintCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.gold} />
          <Text style={styles.hintCardText}>
            <Text style={styles.hintStrong}>Send on WhatsApp: </Text>
            opens the customer's chat directly — no contact list — with the greeting
            typed in. Send the PDF with the button below. Tap here for details.
          </Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          title="Send on WhatsApp"
          onPress={() => void shareOnWhatsApp()}
          icon="message-circle"
        />
        {/* Two half-width buttons keep the row balanced on every screen
            width instead of stacking three full-width ones. */}
        <View style={styles.footerRow}>
          <View style={styles.footerCol}>
            <PrimaryButton
              title={pdfReady ? 'Share PDF' : 'Generating…'}
              onPress={() => void sharePdf()}
              variant="ghost"
              icon="share-2"
            />
          </View>
          <View style={styles.footerCol}>
            <PrimaryButton title="New Sale" onPress={newSale} variant="gold" icon="refresh-cw" />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
  missingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  missingTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  missingSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  brandBand: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1.2,
  },
  logoPlate: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  logo: {
    width: 84,
    height: 62,
  },
  bandRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  bandText: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.accentSoft,
    textAlign: 'right',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  docTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md + 2,
    letterSpacing: 3,
    color: colors.primary,
  },
  flowBadge: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flowBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    color: colors.textOnPrimary,
    letterSpacing: 1,
  },
  metaRow: {
    flexWrap: 'wrap',
    rowGap: 2,
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  metaText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  metaStrong: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  billedCard: {
    backgroundColor: colors.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  billedLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: 3,
  },
  billedName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
  },
  billedSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm + 2,
  },
  th: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    color: colors.textOnPrimary,
    letterSpacing: 1,
  },
  thRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  tableRowEven: { backgroundColor: '#F2F6F1' },
  td: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
    textAlignVertical: 'center',
    alignSelf: 'center',
  },
  tdName: {
    flex: 1.6,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
    alignSelf: 'center',
  },
  tdUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 2,
    color: colors.textMuted,
  },
  strong: { fontFamily: fonts.semiBold },
  totalsCard: {
    alignSelf: 'flex-end',
    width: '62%',
    marginTop: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  totalLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gold,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 12,
    marginTop: 6,
  },
  grandLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.textOnPrimary,
  },
  grandValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textOnPrimary,
  },
  wordsCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
  },
  wordsText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  wordsStrong: {
    fontFamily: fonts.medium,
    color: colors.primary,
  },
  signWrap: {
    marginTop: spacing.lg,
    alignItems: 'flex-end',
  },
  signLine: {
    width: 180,
    height: 1,
    backgroundColor: colors.textMuted,
  },
  signText: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  thanks: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.primary,
  },
  generatedNote: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 3,
  },
  hintCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  hintCardText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  hintStrong: {
    fontFamily: fonts.semiBold,
    color: colors.gold,
  },
  footer: {
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footerCol: {
    flex: 1,
  },
});
