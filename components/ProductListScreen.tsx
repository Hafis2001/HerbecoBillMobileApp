/**
 * Shared product-grid screen used by the Home and Referral tabs.
 * The only differences between the two flows are the cart store, price
 * display (base vs +10%) and accent handling — everything else is identical.
 */

import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import theme from '../constants/theme';
import { formatINR } from '../utils/format';
import { getReferralPrice, round2 } from '../utils/pricing';
import type { CartItem, Product, Unit } from '../types';
import AppHeader from './AppHeader';
import CategoryChip from './CategoryChip';
import ProductCard from './ProductCard';
import EmptyState from './EmptyState';
import QuantityEntryModal from './QuantityEntryModal';

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
}

export function ProductListScreen({
  flow,
  products,
  items,
  addProduct,
  setQuantity,
  increment,
  decrement,
}: ProductListScreenProps) {
  const { width } = useWindowDimensions();
  // Phones get 2 columns, small tablets 3, large tablets/foldables 4, so the
  // cards never stretch into huge uneven blocks.
  const columns = width >= 1000 ? 4 : width >= 720 ? 3 : 2;
  // Referral screens arrive via URL param type=referral from the tab bar.
  const params = useLocalSearchParams<{ type?: string }>();
  const isReferral = flow === 'referral' || params.type === 'referral';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Unit>('all');
  /** Weight product whose quantity is being typed; null when the sheet is closed. */
  const [entryProduct, setEntryProduct] = useState<Product | null>(null);

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
          />
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
          <Text style={styles.referralBannerText}>
            Referral pricing — every product price includes +10%
          </Text>
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
          // FlatList cannot change numColumns in place — remount when it does.
          key={`grid-${columns}`}
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={columns}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              flow={isReferral ? 'referral' : 'home'}
              quantityInCart={qtyInCart(item.id)}
              onAdd={() => handleAdd(item)}
              onQuantityChange={(q) => setQuantity(item.id, q)}
              onRemoveFromCart={() => setQuantity(item.id, 0)}
              onEditQuantity={() => setEntryProduct(item)}
            />
          )}
        />
      )}

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
            // The tab screen already ends above the tab bar, so a fixed gap
            // keeps this bar pinned just above it on every device.
            { bottom: spacing.md },
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  grid: {
    paddingHorizontal: spacing.sm / 2,
    paddingBottom: 160,
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
