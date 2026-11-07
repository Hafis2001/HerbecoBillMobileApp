/**
 * Settings → Products.
 *
 * Pushed from the Settings tab. Add a product, or search the catalogue and
 * edit / delete an item. Everything here feeds the Home and Referral grids.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { formatPriceWithUnit } from '../../utils/format';
import { useProductStore } from '../../store/productStore';
import { showToast } from '../../components/Toast';
import type { Product } from '../../types';
import ProductImage from '../../components/ProductImage';
import EmptyState from '../../components/EmptyState';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function SettingsProductsScreen() {
  const products = useProductStore((s) => s.products);
  const deleteProduct = useProductStore((s) => s.deleteProduct);
  const insets = useSafeAreaInsets();
  // Keeps the last rows scrollable above the keyboard while searching.
  const keyboardHeight = useKeyboardHeight();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [products, search]);

  const confirmDelete = (product: Product) => {
    Alert.alert(
      'Delete product',
      `Delete "${product.name}"? This cannot be undone and does not affect saved bills.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProduct(product.id);
            showToast('Product removed');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Products</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add product"
          onPress={() => router.push('/add-product')}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
        >
          <Feather name="plus" size={15} color={colors.textOnPrimary} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products by name…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="package"
          title={products.length === 0 ? 'No products yet' : 'No products match'}
          subtitle={
            products.length === 0
              ? 'Add your first product with a photo, unit and price. It appears on Home and Referral straight away.'
              : 'Try a different search.'
          }
          actionLabel={products.length === 0 ? 'Add product' : undefined}
          onAction={products.length === 0 ? () => router.push('/add-product') : undefined}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{
            paddingBottom:
              keyboardHeight > 0 ? keyboardHeight + spacing.md : insets.bottom + spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ProductImage uri={item.imageUri} style={styles.thumb} iconSize={22} />
              <View style={styles.rowCenter}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta}>{formatPriceWithUnit(item.price, item.unit)}</Text>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{item.unit === 'kg' ? 'Kg' : 'Unit'}</Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel={`Edit ${item.name}`}
                onPress={() => router.push(`/add-product?id=${item.id}`)}
                style={styles.iconBtn}
                hitSlop={6}
              >
                <Feather name="edit-2" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityLabel={`Delete ${item.name}`}
                onPress={() => confirmDelete(item)}
                style={styles.iconBtn}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  addBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textOnPrimary,
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
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm + 2,
    ...cardShadow,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  rowCenter: { flex: 1, marginLeft: spacing.sm + 4 },
  rowName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  tagText: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.primary,
  },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
});
