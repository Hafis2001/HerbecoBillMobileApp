/**
 * Cart screen — single screen used by both carts via the `type` param
 * ("home" | "referral"). Shows items, bill summary, customer details and
 * generates the invoice. Each cart is validated against its own fields only.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TextInput } from 'react-native';
import theme from '../constants/theme';
import { computeTotals } from '../utils/pricing';
import { useHomeCart } from '../store/homeCartStore';
import { useReferralCart } from '../store/referralCartStore';
import { useInvoiceCounter } from '../store/invoiceStore';
import type { CartItem, CartType, CustomerFormValues, Invoice } from '../types';
import CartItemRow from '../components/CartItem';
import QuantityEntryModal from '../components/QuantityEntryModal';
import EmptyState from '../components/EmptyState';
import PrimaryButton from '../components/PrimaryButton';
import SummaryCard from '../components/SummaryCard';
import { showToast } from '../components/Toast';

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
  const params = useLocalSearchParams<{ type?: string }>();
  const type: CartType = params.type === 'referral' ? 'referral' : 'home';

  // Each type maps to ITS OWN store — no shared state between the flows.
  const items = useHomeCart((s) => s.items);
  const referralItems = useReferralCart((s) => s.items);
  const cartItems = type === 'referral' ? referralItems : items;

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '' },
    mode: 'onChange',
  });

  const totals = useMemo(() => computeTotals(cartItems), [cartItems]);
  const insets = useSafeAreaInsets();
  /** Weight line being re-typed (grams / ₹ amount); null when the sheet is closed. */
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);

  const cartApi = type === 'referral' ? useReferralCart : useHomeCart;

  const clearCart = () => {
    Alert.alert('Clear cart', 'Remove all items from this cart?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          if (type === 'referral') useReferralCart.getState().clearCart();
          else useHomeCart.getState().clearCart();
          showToast('Cart cleared');
        },
      },
    ]);
  };

  const onGenerateBill = handleSubmit(({ name, phone }: CustomerFormValues) => {
    const phoneDigits = phone.replace(/\D/g, '').replace(/^(91|0)/, '');
    const customer = { name: name.trim(), phone: phoneDigits };
    const invoice: Invoice = {
      number: useInvoiceCounter.getState().nextInvoiceNumber(),
      type,
      customer,
      items: cartItems.map((it) => ({ ...it })),
      subtotal: totals.subtotal,
      gst: totals.gst,
      grandTotal: totals.grandTotal,
      createdAt: new Date().toISOString(),
    };
    // Pass the snapshot safely through URL params.
    router.push({ pathname: '/bill', params: { data: JSON.stringify(invoice) } });
  });

  const canGenerate = isValid && cartItems.length > 0;

  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <CartHeader type={type} onClear={clearCart} />
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <CartHeader type={type} onClear={clearCart} />

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
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
        <SummaryCard subtotal={totals.subtotal} gst={totals.gst} grandTotal={totals.grandTotal} />

        <Text style={styles.sectionTitle}>Customer Details</Text>
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <PrimaryButton
          title={`Generate Bill · ₹${totals.grandTotal.toFixed(2)}`}
          onPress={onGenerateBill}
          disabled={!canGenerate}
          icon="file-text"
        />
        <Text style={styles.hint}>
          {cartItems.length === 0
            ? 'Add items to the cart first.'
            : !isValid
              ? 'Enter the customer name and a valid 10-digit mobile number.'
              : 'Ready to create the invoice.'}
        </Text>
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
