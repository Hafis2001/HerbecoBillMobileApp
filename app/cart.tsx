/**
 * Cart screen — single screen used by both carts via the `type` param
 * ("home" | "referral"). Shows items, optional discount, bill summary,
 * customer details and generates the invoice.
 *
 * In the referral cart the customer is still entered by the owner (name +
 * phone, exactly like a home sale). The active referral partner is attached
 * to the bill as a referral, and 10% of it is credited to that partner.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import QRCode from 'react-native-qrcode-svg';
import theme from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import { computeTotals } from '../utils/pricing';
import { useHomeCart } from '../store/homeCartStore';
import { useReferralCart } from '../store/referralCartStore';
import { useInvoiceCounter } from '../store/invoiceStore';
import { useReferralSession } from '../store/referralSession';
import { usePaymentSettings, buildUpiUri } from '../store/paymentSettingsStore';
import type { CartItem, CartType, CustomerFormValues, Invoice, PaymentMethod } from '../types';
import CartItemRow from '../components/CartItem';
import QuantityEntryModal from '../components/QuantityEntryModal';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import SummaryCard from '../components/SummaryCard';
import { showToast } from '../components/Toast';
import { formatINR } from '../utils/format';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

/** 10-digit Indian mobile — accepts optional +91 / 0 prefix and normalises. */
const phoneRegex = /^(?:(?:\+91)|0|)?([6-9]\d{9})$/;

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Enter a valid 10-digit Indian mobile number'),
});

export default function CartScreen() {
  const { isTablet, maxContentWidth } = useResponsive();
  const params = useLocalSearchParams<{ type?: string }>();
  const type: CartType = params.type === 'referral' ? 'referral' : 'home';

  // Each type maps to ITS OWN store — no shared state between the flows.
  const items = useHomeCart((s) => s.items);
  const homeDiscount = useHomeCart((s) => s.discount);
  const referralItems = useReferralCart((s) => s.items);
  const referralDiscount = useReferralCart((s) => s.discount);
  const cartItems = type === 'referral' ? referralItems : items;
  const discount = (type === 'referral' ? referralDiscount : homeDiscount) ?? 0;

  const activeReferral = useReferralSession((s) => s.active);
  /**
   * The partner is only credited on the bill (10%) — the customer is still
   * the person buying, so the customer form stays available.
   */
  const referralPartner = type === 'referral' ? activeReferral : null;

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '' },
    mode: 'onChange',
  });

  const totals = useMemo(() => computeTotals(cartItems, discount), [cartItems, discount]);
  const insets = useSafeAreaInsets();
  /** Weight line being re-typed (grams / ₹ amount); null when the sheet is closed. */
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  /** Raw text in the discount box, so the owner can type "50." without it jumping. */
  const [discountText, setDiscountText] = useState(discount > 0 ? String(discount) : '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [splitBankText, setSplitBankText] = useState('');
  const [showQr, setShowQr] = useState(false);
  const paymentSettings = usePaymentSettings((s) => s.settings);

  const cartApi = type === 'referral' ? useReferralCart : useHomeCart;

  const parsedSplitBank = parseFloat(splitBankText.replace(/[^0-9.]/g, '')) || 0;
  const effectiveBankAmount =
    paymentMethod === 'bank'
      ? totals.grandTotal
      : paymentMethod === 'split'
        ? parsedSplitBank
        : 0;
  const effectiveCashAmount =
    paymentMethod === 'cash'
      ? totals.grandTotal
      : paymentMethod === 'split'
        ? Math.max(0, totals.grandTotal - parsedSplitBank)
        : 0;

  const clearCart = () => {
    Alert.alert('Clear cart', 'Remove all items from this cart?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          if (type === 'referral') useReferralCart.getState().clearCart();
          else useHomeCart.getState().clearCart();
          setDiscountText('');
          showToast('Cart cleared');
        },
      },
    ]);
  };

  const onDiscountChange = (text: string) => {
    // Digits and at most one decimal point.
    const cleaned = text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setDiscountText(cleaned);
    const value = Number.parseFloat(cleaned);
    cartApi.getState().setDiscount(Number.isFinite(value) ? value : 0);
  };

  const buildInvoice = (rawName: string, rawPhone: string) => {
    if (cartItems.length === 0) return;
    const phoneDigits = rawName ? rawPhone.replace(/\D/g, '').replace(/^(91|0)/, '') : '';
    const invoice: Invoice = {
      number: useInvoiceCounter.getState().nextInvoiceNumber(),
      type,
      customer: { name: rawName.trim(), phone: phoneDigits },
      items: cartItems.map((it) => ({ ...it })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      gst: totals.gst,
      grandTotal: totals.grandTotal,
      createdAt: new Date().toISOString(),
      referral:
        type === 'referral' && referralPartner
          ? { code: referralPartner.code, name: referralPartner.name }
          : undefined,
      paymentMethod,
      bankAmount: effectiveBankAmount,
      cashAmount: effectiveCashAmount,
      paymentConfirmed: false,
    };
    router.push({ pathname: '/bill', params: { data: JSON.stringify(invoice) } });
  };

  /** Changing partner means picking (or typing) a different referral ID. */
  const onChangePartner = () => {
    useReferralSession.getState().clearActive();
    router.push('/(tabs)/referral');
  };

  const onGenerateBill = () => {
    if (cartItems.length === 0) return;
    void handleSubmit(({ name, phone }: CustomerFormValues) => buildInvoice(name, phone))();
  };

  const canGenerate =
    cartItems.length > 0 && isValid && (type !== 'referral' || Boolean(referralPartner));
  const discountTooBig = discount > totals.subtotal;

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={[styles.headerWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
          <CartHeader type={type} onClear={clearCart} />
        </View>
        <View style={[styles.flex, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
          <EmptyState
            icon="shopping-cart"
            title="Your cart is empty"
            subtitle={
              type === 'referral'
                ? 'Head to the Referral tab to add products at +10% pricing.'
                : 'Head to the Home tab to add products at normal price.'
            }
            actionLabel="Browse products"
            onAction={() =>
              router.push(type === 'referral' ? '/(tabs)/referral' : '/(tabs)')
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.headerWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <CartHeader type={type} onClear={clearCart} />
      </View>

      {editingItem ? (
        <QuantityEntryModal
          visible
          productName={editingItem.name}
          unit={editingItem.unit}
          unitPrice={editingItem.unitPrice}
          initialQuantity={editingItem.quantity}
          onClose={() => setEditingItem(null)}
          onSubmit={(quantity) => {
            cartApi.getState().setQuantity(editingItem.productId, quantity);
            setEditingItem(null);
          }}
        />
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 120 },
          isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <FlatList
          scrollEnabled={false}
          data={cartItems as CartItem[]}
          keyExtractor={(it) => it.productId}
          renderItem={({ item }) => (
            <CartItemRow
              item={item}
              onQuantityChange={(qty) =>
                (type === 'referral' ? useReferralCart : useHomeCart)
                  .getState()
                  .setQuantity(item.productId, qty)
              }
              onRemove={() =>
                (type === 'referral' ? useReferralCart : useHomeCart)
                  .getState()
                  .removeItem(item.productId)
              }
              onEditQuantity={() => setEditingItem(item)}
            />
          )}
        />

        <Text style={styles.sectionTitle}>Bill Summary</Text>

        {/* Discount — a flat ₹ amount taken off the subtotal before GST. */}
        <View style={[styles.discountCard, cardShadow]}>
          <View style={styles.discountLeft}>
            <Feather name="tag" size={16} color={colors.gold} />
            <View style={styles.discountTextWrap}>
              <Text style={styles.discountLabel}>Discount</Text>
              <Text style={styles.discountHint}>Taken off before GST</Text>
            </View>
          </View>
          <View style={[styles.discountInputWrap, discountTooBig && styles.discountInputError]}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              value={discountText}
              onChangeText={onDiscountChange}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.discountInput}
              maxLength={8}
              accessibilityLabel="Discount amount in rupees"
            />
          </View>
        </View>
        {discountTooBig ? (
          <Text style={styles.discountWarn}>
            Discount can't be more than the subtotal ({formatINR(totals.subtotal)}).
          </Text>
        ) : null}

        <SummaryCard
          subtotal={totals.subtotal}
          discount={totals.discount}
          gst={totals.gst}
          grandTotal={totals.grandTotal}
        />

        {/* Payment mode: Bank, Cash or Split */}
        <Text style={styles.sectionTitle}>Payment Mode</Text>
        <View style={styles.paymentMethodRow}>
          {(['cash', 'bank', 'split'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.pmBtn, paymentMethod === m && styles.pmBtnActive]}
              onPress={() => {
                setPaymentMethod(m);
                if (m === 'cash') setShowQr(false);
              }}
            >
              <Feather
                name={m === 'cash' ? 'dollar-sign' : m === 'bank' ? 'credit-card' : 'git-merge'}
                size={14}
                color={paymentMethod === m ? colors.textOnPrimary : colors.text}
              />
              <Text style={[styles.pmText, paymentMethod === m && styles.pmTextActive]}>
                {m === 'cash' ? 'Cash' : m === 'bank' ? 'Bank (UPI)' : 'Split'}
              </Text>
            </Pressable>
          ))}
        </View>

        {paymentMethod === 'split' ? (
          <View style={[styles.splitBox, cardShadow]}>
            <Text style={styles.splitInputLabel}>Bank / UPI Amount (₹)</Text>
            <View style={styles.splitInputWrap}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                value={splitBankText}
                onChangeText={setSplitBankText}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.splitInput}
              />
            </View>
            <Text style={styles.splitSummary}>
              Bank: {formatINR(effectiveBankAmount)} · Cash: {formatINR(effectiveCashAmount)}
            </Text>
          </View>
        ) : null}

        {/* Dynamic QR display with Close button */}
        {(paymentMethod === 'bank' || paymentMethod === 'split') && effectiveBankAmount > 0 ? (
          <View style={[styles.cartQrCard, cardShadow]}>
            {!showQr ? (
              <Pressable
                style={styles.openQrBtn}
                onPress={() => setShowQr(true)}
              >
                <Feather name="maximize-2" size={16} color={colors.primary} />
                <Text style={styles.openQrBtnText}>Show QR Code · {formatINR(effectiveBankAmount)}</Text>
              </Pressable>
            ) : (
              <View style={styles.qrDisplayWrap}>
                <View style={styles.qrDisplayHead}>
                  <Text style={styles.qrDisplayTitle}>
                    {paymentSettings?.merchantName || 'UPI Payment'}
                  </Text>
                  <Pressable
                    onPress={() => setShowQr(false)}
                    hitSlop={8}
                    style={styles.closeQrBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Close QR"
                  >
                    <Ionicons name="close-circle" size={20} color={colors.danger} />
                    <Text style={styles.closeQrText}>Close QR</Text>
                  </Pressable>
                </View>

                {paymentSettings?.upiId ? (
                  <View style={styles.qrCodeBox}>
                    <QRCode
                      value={buildUpiUri({
                        upiId: paymentSettings.upiId,
                        merchantName: paymentSettings.merchantName || 'HERBECO',
                        amount: effectiveBankAmount,
                        billNumber: 'PAY',
                      })}
                      size={160}
                    />
                    <Text style={styles.qrVpa}>{paymentSettings.upiId}</Text>
                    <Text style={styles.qrAmountHighlight}>{formatINR(effectiveBankAmount)}</Text>
                  </View>
                ) : paymentSettings?.staticQrUri ? (
                  <View style={styles.qrCodeBox}>
                    <Image
                      source={{ uri: paymentSettings.staticQrUri }}
                      style={{ width: 160, height: 160, borderRadius: radius.sm }}
                      resizeMode="contain"
                    />
                    <Text style={styles.qrAmountHighlight}>{formatINR(effectiveBankAmount)}</Text>
                  </View>
                ) : (
                  <View style={styles.noUpiAlert}>
                    <Feather name="alert-circle" size={16} color={colors.gold} />
                    <Text style={styles.noUpiText}>
                      Configure your UPI ID in Settings → Payment Settings to generate dynamic QR.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Customer Details</Text>

        {/* Who earns the 10% — the customer below is still entered by hand. */}
        {type === 'referral' ? (
          referralPartner ? (
            <View style={[styles.partnerStrip, cardShadow]}>
              <View style={styles.partnerAvatar}>
                <Text style={styles.partnerAvatarText}>
                  {referralPartner.name.trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <View style={styles.partnerInfo}>
                <Text style={styles.partnerName} numberOfLines={1}>
                  {referralPartner.name}
                </Text>
                <View style={styles.partnerMetaRow}>
                  <View style={styles.partnerCode}>
                    <Text style={styles.partnerCodeText}>{referralPartner.code}</Text>
                  </View>
                  <Text style={styles.partnerNote} numberOfLines={1}>
                    10% · {formatINR(totals.grandTotal * 0.1)}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onChangePartner}
                accessibilityRole="button"
                accessibilityLabel="Change referral partner"
                hitSlop={8}
                style={styles.changeBtn}
              >
                <Text style={styles.changeText}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.customerCard, cardShadow]}>
              <Text style={styles.noPartnerTitle}>No referral partner selected</Text>
              <Text style={styles.noPartnerText}>
                Enter a referral ID on the Referral tab so this sale credits a partner's 10%.
              </Text>
              <PrimaryButton
                title="Enter referral ID"
                small
                icon="users"
                onPress={() => router.push('/(tabs)/referral')}
                style={styles.noPartnerBtn}
              />
            </View>
          )
        ) : null}

        <View style={[styles.customerCard, cardShadow]}>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <View style={styles.field}>
                  <Text style={styles.label}>Customer name</Text>
                  <View style={[styles.inputWrap, Boolean(errors.name) && { borderColor: colors.danger }]}>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="e.g. Ramesh Kumar"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                      returnKeyType="next"
                    />
                  </View>
                  {errors.name ? <Text style={styles.error}>{errors.name.message}</Text> : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <View>
                  <Text style={styles.label}>Phone number (WhatsApp)</Text>
                  <View style={[styles.inputWrap, Boolean(errors.phone) && { borderColor: colors.danger }]}>
                    <Text style={styles.prefix}>+91</Text>
                    <TextInput
                      value={value}
                      onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 10))}
                      onBlur={onBlur}
                      placeholder="9876543210"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                      keyboardType="phone-pad"
                      returnKeyType="done"
                      maxLength={10}
                    />
                  </View>
                  {errors.phone ? <Text style={styles.error}>{errors.phone.message}</Text> : null}
                </View>
              )}
            />
          </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <View style={[styles.footerInner, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
          <PrimaryButton
            title={`Generate Bill · ${formatINR(totals.grandTotal)}`}
            onPress={onGenerateBill}
            disabled={!canGenerate}
            icon="file-text"
          />
          <Text style={styles.hint}>
            {cartItems.length === 0
              ? 'Add items to the cart first.'
              : type === 'referral' && !referralPartner
                ? 'Select a referral partner on the Referral tab first.'
                : !isValid
                  ? 'Enter the customer name and a valid 10-digit mobile number.'
                  : 'Ready to create the invoice.'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Local header with back button, flow-aware title and clear-cart action. */
function CartHeader({ type, onClear }: { type: CartType; onClear: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>
        {type === 'referral' ? 'Referral Cart' : 'Home Cart'}
      </Text>
      <Pressable onPress={onClear} accessibilityLabel="Clear cart" hitSlop={8}>
        <Ionicons name="trash-outline" size={21} color={colors.danger} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrap: {
    width: '100%',
  },
  footerInner: {
    width: '100%',
  },
  flex: {
    flex: 1,
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
  body: {
    paddingHorizontal: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  discountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  discountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  discountTextWrap: { flex: 1 },
  discountLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  discountHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
  discountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 104,
    maxWidth: 140,
    flexShrink: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    minHeight: 44,
  },
  discountInputError: { borderColor: colors.danger },
  rupee: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginRight: 3,
  },
  discountInput: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
    textAlign: 'right',
  },
  discountWarn: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.danger,
    marginBottom: spacing.sm,
    marginTop: -2,
  },
  customerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  field: {
    marginBottom: spacing.md,
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  prefix: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textMuted,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
    padding: 0,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.danger,
    fontFamily: fonts.regular,
  },
  partnerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  partnerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  changeBtn: {
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  changeText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.gold,
  },
  partnerAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarText: {
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
  partnerCode: {
    flexShrink: 0,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  partnerCodeText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 2,
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  partnerNote: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.gold,
  },
  noPartnerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  noPartnerText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  noPartnerBtn: { marginTop: spacing.md },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 4,
  },
  pmBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pmText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.text,
  },
  pmTextActive: {
    color: colors.textOnPrimary,
  },
  splitBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  splitInputLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
    marginBottom: 6,
  },
  splitInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 46,
    paddingHorizontal: spacing.sm + 4,
    gap: 4,
  },
  splitInput: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    padding: 0,
  },
  splitSummary: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 6,
  },
  cartQrCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  openQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 4,
  },
  openQrBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  qrDisplayWrap: {
    alignItems: 'center',
  },
  qrDisplayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.sm,
  },
  qrDisplayTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  closeQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  closeQrText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  qrCodeBox: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  qrVpa: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  qrAmountHighlight: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.primary,
    marginTop: 2,
  },
  noUpiAlert: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    alignItems: 'flex-start',
  },
  noUpiText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.text,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  hint: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
