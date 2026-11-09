/**
 * Edit a saved bill (Bills tab → Edit).
 *
 * Everything on the invoice can be changed: the customer, the discount, and
 * the lines — add another product, change a quantity or overwrite a rate.
 * Totals are recomputed with the same rules as the cart (discount first, then
 * 5% GST), the SQLite row is updated in place (its upload status is kept) and
 * the cached PDF is dropped so the next share shows the edited bill.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import { useProductStore } from '../store/productStore';
import { getInvoiceRecord, saveInvoice } from '../store/invoiceDb';
import { invalidateInvoicePdf } from '../utils/pdf';
import { computeTotals, getReferralPrice, round2 } from '../utils/pricing';
import { formatINR, formatPriceWithUnit } from '../utils/format';
import { showToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';
import SummaryCard from '../components/SummaryCard';
import type { CartItem, Invoice, InvoiceRecord, Product, Unit } from '../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

/** One editable line. Numbers are kept as text so typing feels natural. */
interface EditLine {
  productId: string;
  name: string;
  unit: Unit;
  qtyText: string;
  rateText: string;
}

const toNumber = (text: string): number => {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : 0;
};

/** Digits plus a single decimal point, as text. */
const numericText = (text: string): string =>
  text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

export default function EditBillScreen() {
  const { isTablet, maxContentWidth } = useResponsive();
  const params = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const products = useProductStore((s) => s.products);

  const [record, setRecord] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [discountText, setDiscountText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = params.id ? await getInvoiceRecord(params.id) : null;
        if (cancelled) return;
        if (!found) {
          setRecord(null);
          return;
        }
        setRecord(found);
        setName(found.customerName);
        setPhone(found.customerPhone);
        setDiscountText(found.discount > 0 ? String(found.discount) : '');
        setLines(
          found.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            unit: item.unit,
            qtyText: String(item.quantity),
            rateText: String(item.unitPrice),
          })),
        );
      } catch {
        if (!cancelled) {
          setRecord(null);
          showToast('Could not open this bill', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const isReferral = record?.type === 'referral';

  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((line) => ({
          unitPrice: toNumber(line.rateText),
          quantity: toNumber(line.qtyText),
        })),
        toNumber(discountText),
      ),
    [lines, discountText],
  );

  const phoneValid = /^[6-9]\d{9}$/.test(phone);

  const updateLine = (productId: string, patch: Partial<EditLine>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const removeLine = (productId: string) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  /** Adds a catalogue product to the bill, or bumps its quantity by one. */
  const addProduct = (product: Product) => {
    const rate = isReferral ? getReferralPrice(product.price) : product.price;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, qtyText: String(round2(toNumber(l.qtyText) + 1)) }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          qtyText: '1',
          rateText: String(rate),
        },
      ];
    });
    setPickerOpen(false);
    setSearch('');
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const onSave = async () => {
    if (!record || saving) return;
    if (!name.trim()) {
      showToast('Customer name is required', 'error');
      return;
    }
    if (!phoneValid) {
      showToast('Enter a valid 10-digit mobile number', 'error');
      return;
    }
    const items: CartItem[] = lines
      .map((line) => ({
        productId: line.productId,
        name: line.name,
        unit: line.unit,
        unitPrice: round2(toNumber(line.rateText)),
        quantity: round2(toNumber(line.qtyText)),
      }))
      .filter((line) => line.quantity > 0);
    if (items.length === 0) {
      showToast('Keep at least one item with a quantity', 'error');
      return;
    }

    const invoice: Invoice = {
      number: record.number,
      type: record.type,
      customer: { name: name.trim(), phone },
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      gst: totals.gst,
      grandTotal: totals.grandTotal,
      // The bill keeps its original date and referral tag.
      createdAt: new Date(record.createdAtMs).toISOString(),
      referral:
        record.referralCode && record.referralName
          ? { code: record.referralCode, name: record.referralName }
          : undefined,
    };

    setSaving(true);
    try {
      await saveInvoice(invoice);
      await invalidateInvoicePdf(invoice.number);
      showToast(`${invoice.number} updated`);
      router.back();
    } catch {
      showToast('Could not save the changes', 'error');
    } finally {
      setSaving(false);
    }
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

  if (!record) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={38} color={colors.danger} />
          <Text style={styles.missingTitle}>Bill not found</Text>
          <Text style={styles.missingText}>It may have been deleted.</Text>
          <PrimaryButton title="Back to Bills" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const discountTooBig = toNumber(discountText) > totals.subtotal;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.header, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Edit {record.number}</Text>
          <Text style={styles.headerMeta}>
            {record.type === 'referral' ? 'Referral sale' : 'Home sale'}
            {record.referralName ? ` · ${record.referralName}` : ''}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 110 },
          isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={[styles.card, cardShadow]}>
          <Text style={styles.label}>Customer name</Text>
          <View style={styles.inputWrap}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Customer name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <Text style={[styles.label, styles.labelGap]}>Phone number (WhatsApp)</Text>
          <View style={[styles.inputWrap, Boolean(phone) && !phoneValid && styles.inputError]}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
          {phone && !phoneValid ? (
            <Text style={styles.errorText}>Enter a valid 10-digit mobile number.</Text>
          ) : null}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Items</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a product to this bill"
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          >
            <Feather name="plus" size={15} color={colors.textOnPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {lines.length === 0 ? (
          <View style={[styles.card, cardShadow]}>
            <Text style={styles.emptyLine}>No items on this bill — add one above.</Text>
          </View>
        ) : (
          lines.map((line) => (
            <View key={line.productId} style={[styles.itemCard, cardShadow]}>
              <View style={styles.itemTop}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {line.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.name}`}
                  onPress={() => removeLine(line.productId)}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
              </View>

              <View style={styles.itemFields}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>
                    Qty {line.unit === 'kg' ? '(kg)' : '(pcs)'}
                  </Text>
                  <TextInput
                    value={line.qtyText}
                    onChangeText={(value) =>
                      updateLine(line.productId, { qtyText: numericText(value) })
                    }
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={colors.textMuted}
                    style={styles.smallInput}
                    maxLength={7}
                    accessibilityLabel={`Quantity of ${line.name}`}
                  />
                </View>

                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>
                    {line.unit === 'kg' ? 'Rate / kg' : 'Rate / pc'}
                  </Text>
                  <View style={styles.rateWrap}>
                    <Text style={styles.ratePrefix}>₹</Text>
                    <TextInput
                      value={line.rateText}
                      onChangeText={(value) =>
                        updateLine(line.productId, { rateText: numericText(value) })
                      }
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.smallInput, styles.rateInput]}
                      maxLength={8}
                      accessibilityLabel={`Rate of ${line.name}`}
                    />
                  </View>
                </View>

                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>Amount</Text>
                  <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>
                    {formatINR(round2(toNumber(line.rateText) * toNumber(line.qtyText)))}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Discount</Text>
        <View style={[styles.discountCard, cardShadow]}>
          <View style={styles.discountLeft}>
            <Feather name="tag" size={16} color={colors.gold} />
            <View style={styles.discountTextWrap}>
              <Text style={styles.discountLabel}>Discount</Text>
              <Text style={styles.discountHint}>Taken off before GST</Text>
            </View>
          </View>
          <View style={[styles.discountInputWrap, discountTooBig && styles.inputError]}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              value={discountText}
              onChangeText={(value) => setDiscountText(numericText(value))}
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
          <Text style={styles.errorText}>
            Discount can't be more than the subtotal ({formatINR(totals.subtotal)}).
          </Text>
        ) : null}

        <View style={styles.summaryWrap}>
          <SummaryCard
            subtotal={totals.subtotal}
            discount={totals.discount}
            gst={totals.gst}
            grandTotal={totals.grandTotal}
          />
        </View>

        <Text style={styles.hint}>
          Changing the bill recalculates GST and updates the saved entry. Its date, number and
          upload status stay the same.
        </Text>
      </ScrollView>

      {/* Lifts above the keyboard so Save stays reachable while typing a rate. */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <View style={[{ width: '100%' }, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center' }]}>
          <PrimaryButton
            title={saving ? 'Saving…' : `Save changes · ${formatINR(totals.grandTotal)}`}
            onPress={() => void onSave()}
            disabled={saving || lines.length === 0 || discountTooBig}
            icon="check"
          />
        </View>
      </View>

      {/* Product picker */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPickerOpen(false)}
            accessibilityLabel="Close product picker"
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.md },
              isTablet && { maxWidth: 520, alignSelf: 'center', width: '100%', borderRadius: radius.lg },
            ]}
          >
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Add a product</Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                accessibilityLabel="Close"
                hitSlop={10}
              >
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Feather name="search" size={17} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search products…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>

            {filteredProducts.length === 0 ? (
              <Text style={styles.emptyLine}>
                {products.length === 0
                  ? 'No products yet — add them in Settings → Products.'
                  : 'No product matches that search.'}
              </Text>
            ) : (
              <FlatList
                data={filteredProducts}
                keyExtractor={(p) => p.id}
                keyboardShouldPersistTaps="handled"
                style={styles.pickerList}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.name}`}
                    onPress={() => addProduct(item)}
                    style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.8 }]}
                  >
                    <View style={styles.pickerInfo}>
                      <Text style={styles.pickerName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.pickerMeta}>
                        {formatPriceWithUnit(item.price, item.unit)}
                        {isReferral ? ' · +10% referral' : ''}
                      </Text>
                    </View>
                    <Feather name="plus-circle" size={20} color={colors.primary} />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  headerMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
  headerSpacer: { width: 24 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  labelGap: { marginTop: spacing.sm + 2 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.danger },
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
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.danger,
    fontFamily: fonts.regular,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 4,
    minHeight: 34,
    marginBottom: spacing.sm,
  },
  addBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textOnPrimary,
  },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  itemName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemFields: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fieldCol: { flex: 1 },
  fieldLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginBottom: 4,
  },
  smallInput: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  rateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingLeft: spacing.sm,
    minHeight: 42,
  },
  ratePrefix: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  rateInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  amountText: {
    minHeight: 42,
    textAlignVertical: 'center',
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.primary,
    paddingTop: 11,
  },
  emptyLine: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
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
  summaryWrap: { marginTop: spacing.sm },
  hint: {
    marginTop: spacing.sm + 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    maxHeight: '82%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 2,
    minHeight: 44,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.text,
    padding: 0,
  },
  pickerList: { maxHeight: 340 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.xs + 2,
  },
  pickerInfo: { flex: 1 },
  pickerName: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  pickerMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
});
