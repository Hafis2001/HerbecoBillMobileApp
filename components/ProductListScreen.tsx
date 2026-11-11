/**
 * Shared product-grid screen used by the Home and Referral tabs.
 * The only differences between the two flows are the cart store, price
 * display (base vs +10%) and accent handling — everything else is identical.
 */

import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import theme from '../constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import { formatINR, formatPriceWithUnit } from '../utils/format';
import { getReferralPrice, round2 } from '../utils/pricing';
import { getProductStockBalances, syncRecipeBillingProducts, type ProductStockInfo } from '../store/stockDb';
import { formatBaseQty } from '../utils/stock';
import type { CartItem, Product, Unit } from '../types';
import AppHeader from './AppHeader';
import CategoryChip from './CategoryChip';
import EmptyState from './EmptyState';
import ProductImage from './ProductImage';
import QuantityEntryModal from './QuantityEntryModal';
import QuantitySelector from './QuantitySelector';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const FILTERS: Array<{ key: 'all' | Unit; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'kg', label: 'Kg' },
  { key: 'unit', label: 'Unit' },
];

interface ProductListScreenProps {
  flow: 'home' | 'referral';
  products: Product[];
  items: CartItem[];
  /** Adds a product/quantity to THIS flow's cart only. */
  addProduct: (product: Product, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  increment: (productId: string, step?: number) => void;
  decrement: (productId: string, step?: number) => void;
  /** Name of the active referral partner (referral flow only). */
  referralName?: string;
  /** Switches to a different referral ID (clears the active partner). */
  onChangeReferral?: () => void;
}

export function ProductListScreen({
  flow,
  products,
  items,
  addProduct,
  setQuantity,
  increment,
  decrement,
  referralName,
  onChangeReferral,
}: ProductListScreenProps) {
  const { isTablet, maxContentWidth } = useResponsive();
  // Referral screens arrive via URL param type=referral from the tab bar.
  const params = useLocalSearchParams<{ type?: string }>();
  const isReferral = flow === 'referral' || params.type === 'referral';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Unit>('all');
  /** Weight product whose quantity is being typed; null when the sheet is closed. */
  const [entryProduct, setEntryProduct] = useState<Product | null>(null);
  const [stockBalances, setStockBalances] = useState<Record<string, ProductStockInfo>>({});

  const reloadStock = useCallback(async () => {
    try {
      await syncRecipeBillingProducts().catch(() => {});
      const balances = await getProductStockBalances();
      setStockBalances(balances);
    } catch (e) {
      console.log('reloadStock error', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reloadStock();
    }, [reloadStock]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) => (filter === 'all' || p.unit === filter) && p.name.toLowerCase().includes(q),
    );
  }, [products, search, filter]);

  const qtyInCart = (productId: string) =>
    items.find((it) => it.productId === productId)?.quantity ?? 0;

  const itemCount = items.length;
  const subtotal = round2(
    items.reduce((sum, it) => sum + round2(it.unitPrice * it.quantity), 0),
  );

  const openCart = () => router.push(`/cart?type=${flow}`);

  /** Referral flow charges the +10% price; the sheet quotes the same figure. */
  const unitPriceFor = (product: Product) =>
    isReferral ? getReferralPrice(product.price) : product.price;

  /**
   * Weight products open the entry sheet so the owner can type grams (or a
   * rupee amount) instead of being stuck with a 0.5 kg stepper. Pieces are
   * added straight away — they have no partial quantity.
   */
  const handleAdd = (product: Product) => {
    if (product.unit === 'kg') {
      setEntryProduct(product);
      return;
    }
    addProduct(product, 1);
  };

  const applyEntry = (product: Product, quantity: number) => {
    if (qtyInCart(product.id) > 0) setQuantity(product.id, quantity);
    else addProduct(product, quantity);
    setEntryProduct(null);
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        rightIcon="shopping-cart"
        rightBadge={itemCount}
        onRightPress={openCart}
        rightAccessibilityLabel={`Open ${isReferral ? 'referral' : 'home'} cart`}
      />

      <View style={[styles.mainContainer, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        {/* Search + filter chips */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={isReferral ? 'Search referral products…' : 'Search products…'}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {search.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearch('')}
                hitSlop={10}
              >
                <Feather name="x-circle" size={17} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.chipsRow}>
          {FILTERS.map((f) => (
            <CategoryChip
              key={f.key}
              label={f.label}
              active={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>

        {isReferral ? (
          <View style={styles.referralBanner}>
            <Feather name="users" size={14} color={colors.gold} />
            <Text style={styles.referralBannerText} numberOfLines={2}>
              {referralName ? `${referralName} · ` : ''}Referral pricing — every product
              price includes +10%
            </Text>
            {onChangeReferral ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change referral ID"
                onPress={onChangeReferral}
                hitSlop={8}
                style={({ pressed }) => [styles.changeChip, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.changeChipText}>Change</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            title={products.length === 0 ? 'No products yet' : 'No products match'}
            subtitle={
              products.length === 0
                ? 'Add your first product to start selling.'
                : 'Try a different search or filter.'
            }
            actionLabel={products.length === 0 ? 'Add product' : undefined}
            onAction={products.length === 0 ? () => router.push('/add-product') : undefined}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            renderItem={({ item }) => {
              const qty = qtyInCart(item.id);
              const flowPrice = unitPriceFor(item);
              const stockInfo = stockBalances[item.id];
              let stockText: string | undefined;
              let isOutOfStock = false;
              if (stockInfo) {
                if (stockInfo.unitType === 'weight') {
                  stockText = `Available: ${formatBaseQty(stockInfo.balanceBase, 'weight')}`;
                  isOutOfStock = stockInfo.balanceBase <= 0;
                } else {
                  stockText = `Available: ${formatBaseQty(stockInfo.availableUnits, 'piece', stockInfo.displayUnit)}`;
                  isOutOfStock = stockInfo.availableUnits <= 0;
                }
              }
              return (
                <ProductListRow
                  product={item}
                  flow={isReferral ? 'referral' : 'home'}
                  quantityInCart={qty}
                  flowPrice={flowPrice}
                  stockText={stockText}
                  isOutOfStock={isOutOfStock}
                  onAdd={() => handleAdd(item)}
                  onQuantityChange={(q) => setQuantity(item.id, q)}
                  onRemoveFromCart={() => setQuantity(item.id, 0)}
                  onEditQuantity={() => setEntryProduct(item)}
                />
              );
            }}
          />
        )}
      </View>

      {entryProduct ? (
        <QuantityEntryModal
          visible
          productName={entryProduct.name}
          unit={entryProduct.unit}
          unitPrice={unitPriceFor(entryProduct)}
          initialQuantity={qtyInCart(entryProduct.id)}
          onClose={() => setEntryProduct(null)}
          onSubmit={(quantity) => applyEntry(entryProduct, quantity)}
        />
      ) : null}

      {/* Floating "View Cart" bar (only when the cart has items) */}
      {itemCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={openCart}
          style={(state) => [
            styles.floatBar,
            { bottom: spacing.md },
            isTablet && {
              left: '50%',
              marginLeft: -((maxContentWidth ?? 680) - spacing.md * 2) / 2,
              width: (maxContentWidth ?? 680) - spacing.md * 2,
              right: undefined,
            },
            cardShadow,
            Boolean(state.pressed) && { opacity: 0.92 },
          ]}
        >
          <Feather name="shopping-cart" size={18} color={colors.textOnPrimary} />
          <Text style={styles.floatText}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatINR(subtotal)}
          </Text>
          <View style={styles.floatCta}>
            <Text style={styles.floatCtaText}>View Cart →</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

interface ProductListRowProps {
  product: Product;
  flow: 'home' | 'referral';
  quantityInCart: number;
  flowPrice: number;
  stockText?: string;
  isOutOfStock?: boolean;
  onAdd: () => void;
  onQuantityChange: (qty: number) => void;
  onRemoveFromCart: () => void;
  onEditQuantity: () => void;
}

function ProductListRow({
  product,
  flow,
  quantityInCart,
  flowPrice,
  stockText,
  isOutOfStock,
  onAdd,
  onQuantityChange,
  onRemoveFromCart,
  onEditQuantity,
}: ProductListRowProps) {
  const isReferral = flow === 'referral';

  return (
    <View style={styles.row}>
      <ProductImage uri={product.imageUri} style={styles.thumb} iconSize={22} />
      <View style={styles.rowCenter}>
        <Text style={styles.rowName} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.rowPriceRow}>
          {isReferral ? (
            <Text style={styles.rowOldPrice}>
              {formatPriceWithUnit(product.price, product.unit)}
            </Text>
          ) : null}
          <Text style={[styles.rowPrice, isReferral && styles.rowReferralPrice]}>
            {formatPriceWithUnit(flowPrice, product.unit)}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.tag, isReferral && styles.referralTag]}>
            <Text style={[styles.tagText, isReferral && styles.referralTagText]}>
              {isReferral ? '+10% Referral' : product.unit === 'kg' ? 'By weight (kg)' : 'Per unit'}
            </Text>
          </View>
          {stockText ? (
            <Text style={[styles.rowStockText, isOutOfStock && styles.rowStockOutText]}>
              {stockText}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actionWrap}>
        {quantityInCart > 0 ? (
          <QuantitySelector
            size="sm"
            unit={product.unit}
            quantity={quantityInCart}
            onChange={onQuantityChange}
            onRemove={onRemoveFromCart}
            onPressValue={product.unit === 'kg' ? onEditQuantity : undefined}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name}`}
            onPress={onAdd}
            style={({ pressed }) => [styles.rowAddBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.rowAddBtnText}>+ Add</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContainer: {
    flex: 1,
  },
  searchRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  referralBannerText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.gold,
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: 160,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  rowCenter: { flex: 1, marginLeft: spacing.sm + 4, marginRight: spacing.sm },
  rowName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  rowPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  rowPrice: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.primary,
  },
  rowReferralPrice: {
    color: colors.gold,
  },
  rowOldPrice: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    flexWrap: 'wrap',
    marginTop: 3,
  },
  rowStockText: {
    fontFamily: fonts.semiBold,
    fontSize: 11,
    color: colors.primary,
  },
  rowStockOutText: {
    color: colors.danger,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  tagText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.primary,
  },
  referralTag: {
    backgroundColor: colors.goldSoft,
  },
  referralTagText: {
    color: colors.gold,
  },
  actionWrap: {
    minWidth: 84,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rowAddBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAddBtnText: {
    color: colors.textOnPrimary,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
  },
  changeChip: {
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  changeChipText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.textOnPrimary,
  },
  column: {
    // Cards carry their own outer margin, which keeps the gutters even for
    // 2, 3 or 4 columns without extra wrapper padding.
    gap: 0,
  },
  floatBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: 56,
    gap: spacing.sm + 2,
  },
  floatText: {
    color: colors.textOnPrimary,
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    flex: 1,
  },
  floatCta: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  floatCtaText: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
  },
});

export default ProductListScreen;
