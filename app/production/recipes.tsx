/**
 * Production → Recipes.
 *
 * One card per recipe: photo, name, how the finished product is counted
 * and every ingredient with its per-unit quantity. Tapping opens the
 * edit sheet (same sheet as "New recipe"), the + button creates one.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { showToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';
import RecipeFormModal from '../../components/stock/RecipeFormModal';
import {
  getProductStockBalances,
  getRecipes,
  getStockItems,
  type ProductStockInfo,
} from '../../store/stockDb';
import { useProductStore } from '../../store/productStore';
import { formatBaseQty, displayUnitSingle } from '../../utils/stock';
import { formatINR } from '../../utils/format';
import type { Recipe, StockItem } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function ProductionRecipesScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const products = useProductStore((s) => s.products);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [productStock, setProductStock] = useState<Record<string, ProductStockInfo>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const reload = useCallback(async () => {
    try {
      const [recipeList, items, balances] = await Promise.all([
        getRecipes(),
        getStockItems(),
        getProductStockBalances(),
      ]);
      setRecipes(recipeList);
      setStockItems(items);
      setProductStock(balances);
    } catch {
      showToast('Could not load recipes', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (recipe: Recipe) => {
    setEditing(recipe);
    setFormOpen(true);
  };

  const itemName = (stockItemId: string): string =>
    stockItems.find((s) => s.id === stockItemId)?.name ?? 'Removed stock item';

  const itemUnitType = (stockItemId: string) =>
    stockItems.find((s) => s.id === stockItemId)?.unitType ?? 'piece';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Recipes</Text>
          <Pressable onPress={openAdd} accessibilityLabel="Add recipe" hitSlop={8}>
            <Feather name="plus-circle" size={22} color={colors.primary} />
          </Pressable>
        </View>

        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <EmptyState
                icon="book-open"
                title="No recipes yet"
                subtitle="A recipe says which materials go into one finished product — e.g. 100 g coffee + 1 bottle + 1 cap per jar."
                actionLabel="Create recipe"
                onAction={openAdd}
              />
            )
          }
          renderItem={({ item: recipe }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit recipe ${recipe.name}`}
              onPress={() => openEdit(recipe)}
              style={({ pressed }) => [styles.card, cardShadow, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.cardTop}>
                {recipe.imageUri ? (
                  <Image source={{ uri: recipe.imageUri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]}>
                    <Feather name="feather" size={18} color={colors.primary} />
                  </View>
                )}
                <View style={styles.cardHead}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {recipe.name}
                  </Text>
                  <Text style={styles.cardRate}>
                    Rate: {formatINR(recipe.price || 0)} per {displayUnitSingle(recipe.finishedUnit)}
                  </Text>
                  <Text style={styles.cardMeta}>
                    Per 1 {displayUnitSingle(recipe.finishedUnit)}: {recipe.items.length} ingredient{recipe.items.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <Feather name="edit-2" size={17} color={colors.textMuted} />
              </View>

              <View style={styles.ingredientList}>
                {recipe.items.map((line) => (
                  <View key={line.id} style={styles.ingredientRow}>
                    <View style={styles.ingredientDot} />
                    <Text style={styles.ingredientName} numberOfLines={1}>
                      {itemName(line.stockItemId)}
                    </Text>
                    <Text style={styles.ingredientQty}>
                      {formatBaseQty(line.qtyPerUnitBase, itemUnitType(line.stockItemId))}
                    </Text>
                  </View>
                ))}
              </View>

              {recipe.notes ? (
                <Text style={styles.cardNotes} numberOfLines={2}>
                  {recipe.notes}
                </Text>
              ) : null}

              <View style={styles.cardActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Produce ${recipe.name}`}
                  onPress={() =>
                    router.push({
                      pathname: '/production/create',
                      params: { recipeId: recipe.id },
                    })
                  }
                  style={({ pressed }) => [styles.produceBtn, pressed && { opacity: 0.85 }]}
                >
                  <Feather name="play-circle" size={15} color={colors.textOnPrimary} />
                  <Text style={styles.produceBtnText}>Produce</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${recipe.name}`}
                  onPress={() => openEdit(recipe)}
                  style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.85 }]}
                >
                  <Feather name="edit-2" size={14} color={colors.text} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      </View>

      <RecipeFormModal
        visible={formOpen}
        editing={editing}
        stockItems={stockItems}
        products={products}
        productStock={productStock}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mainWrap: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  loadingWrap: { paddingVertical: spacing.lg, alignItems: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flex: 1 },
  cardName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: 2,
  },
  cardRate: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginBottom: 2,
  },
  cardMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  ingredientList: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
    gap: 5,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ingredientDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  ingredientName: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  ingredientQty: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  cardNotes: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  produceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  produceBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textOnPrimary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  editBtnText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
});
