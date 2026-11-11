/**
 * Production → Create a batch.
 *
 * Pick a recipe and how much to produce; the material summary is
 * previewed live (required / available / after) with shortfall warnings
 * and a max-producible hint. Confirming runs the whole batch in one
 * SQLite transaction — either everything is deducted and produced, or
 * nothing changes.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { showToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  computeProductionPlan,
  createProductionBatch,
  getRecipes,
  type ProductionPlan,
} from '../../store/stockDb';
import { displayUnitLabel, displayUnitSingle, formatBaseQty, numericText } from '../../utils/stock';
import { formatINR } from '../../utils/format';
import type { Recipe } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export default function CreateProductionScreen() {
  const insets = useSafeAreaInsets();
  const { isTablet, maxContentWidth } = useResponsive();
  const params = useLocalSearchParams<{ recipeId?: string }>();
  const paramRecipeId = typeof params.recipeId === 'string' ? params.recipeId : undefined;

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [recipeId, setRecipeId] = useState<string | null>(paramRecipeId ?? null);
  const [qtyText, setQtyText] = useState('1');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await getRecipes();
      setRecipes(list);
      setRecipeId((current) => paramRecipeId ?? current ?? list[0]?.id ?? null);
    } catch {
      showToast('Could not load recipes', 'error');
    } finally {
      setLoading(false);
    }
  }, [paramRecipeId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === recipeId) ?? null,
    [recipes, recipeId],
  );

  // Live material preview — re-planned whenever the recipe or quantity changes.
  const qty = Number.parseFloat(qtyText);
  const validQty = Number.isFinite(qty) && qty > 0;
  useEffect(() => {
    let cancelled = false;
    if (!recipeId || !validQty) {
      setPlan(null);
      return;
    }
    setPlanLoading(true);
    computeProductionPlan(recipeId, qty)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch(() => {
        if (!cancelled) setPlan(null);
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, qty, validQty]);

  const unitWord = selectedRecipe
    ? displayUnitLabel(selectedRecipe.finishedUnit || 'pieces')
    : 'units';
  const unitSingle = selectedRecipe
    ? displayUnitSingle(selectedRecipe.finishedUnit || 'piece')
    : 'unit';

  const onProduce = () => {
    if (!selectedRecipe || !validQty || saving) return;
    if (plan?.hasShortage) {
      const lines = plan.rows
        .filter((r) => r.shortfallBase > 0)
        .map(
          (r) =>
            `• ${formatBaseQty(r.shortfallBase, r.unitType, r.displayUnit)} of ${r.name} (need ${formatBaseQty(
              r.requiredBase,
              r.unitType,
              r.displayUnit,
            )}, have ${formatBaseQty(r.availableBase, r.unitType, r.displayUnit)})`,
        );
      Alert.alert(
        'Insufficient stock',
        `You cannot produce ${qty} ${unitWord} of ${selectedRecipe.name} yet. Restock these materials first:\n\n${lines.join(
          '\n',
        )}`,
        [{ text: 'OK', style: 'cancel' }],
      );
      return;
    }
    Alert.alert(
      'Confirm production',
      `Produce ${qty} ${unitWord} of ${selectedRecipe.name}? The ingredients will be deducted from stock now.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Produce',
          onPress: () => void run(),
        },
      ],
    );
  };

  const run = async () => {
    if (!selectedRecipe || !validQty) return;
    setSaving(true);
    try {
      const result = await createProductionBatch(selectedRecipe.id, qty, notes);
      if (result.ok && result.batch) {
        showToast(`Batch ${result.batch.batchNo} produced`);
        router.replace('/production');
      } else {
        const lines = (result.shortages ?? [])
          .map(
            (s) =>
              `• ${formatBaseQty(s.shortfallBase, s.unitType)} of ${s.name}`,
          );
        Alert.alert(
          'Insufficient stock',
          `Stock changed while you were editing. Restock these materials first:\n\n${lines.join('\n')}`,
          [{ text: 'OK', style: 'cancel' }],
        );
      }
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not record the production batch',
        'error',
      );
      console.log('createProductionBatch error', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (recipes.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Create Production</Text>
          <View style={{ width: 28 }} />
        </View>
        <EmptyState
          icon="book-open"
          title="No recipes yet"
          subtitle="Create a recipe first — then come back here to produce batches from it."
          actionLabel="Go to recipes"
          onAction={() => router.replace('/production/recipes')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Create Production</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.label}>Recipe</Text>
          <View style={styles.recipeList}>
            {recipes.map((recipe) => {
              const active = recipe.id === recipeId;
              return (
                <Pressable
                  key={recipe.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setRecipeId(recipe.id)}
                  style={[styles.recipeChip, active && styles.recipeChipActive]}
                >
                  <Text style={[styles.recipeChipText, active && styles.recipeChipTextActive]}>
                    {recipe.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedRecipe ? (
            <Text style={styles.rateHint}>
              Selling Rate: {formatINR(selectedRecipe.price || 0)} per {unitSingle}
            </Text>
          ) : null}

          <Text style={[styles.label, styles.inputGap]}>Quantity to produce ({unitWord})</Text>
          <View style={styles.qtyRow}>
            <TextInput
              value={qtyText}
              onChangeText={(v) => setQtyText(numericText(v))}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.qtyInput}
            />
            <Text style={styles.qtyUnit}>{unitWord}</Text>
          </View>

          {plan && plan.maxProducible !== Infinity && validQty ? (
            <Text style={styles.maxLine}>
              Current materials allow up to{' '}
              <Text style={styles.maxStrong}>{plan.maxProducible} {unitWord}</Text> of{' '}
              {plan.recipe.name}.
            </Text>
          ) : null}

          {/* Live material summary */}
          {validQty && selectedRecipe ? (
            <View style={[styles.planCard, cardShadow]}>
              <View style={styles.planHead}>
                <Text style={styles.planTitle}>Materials needed</Text>
                {planLoading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              </View>
              {!plan || plan.rows.length === 0 ? (
                <Text style={styles.planEmpty}>
                  This recipe has no ingredients yet — edit it in Recipes.
                </Text>
              ) : (
                plan.rows.map((row) => {
                  const short = row.shortfallBase > 0;
                  return (
                    <View key={row.stockItemId} style={styles.planRow}>
                      <View style={styles.planRowBody}>
                        <Text style={styles.planName} numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text style={[styles.planMeta, short && { color: colors.danger }]}>
                          {formatBaseQty(row.requiredBase, row.unitType, row.displayUnit)} needed ·{' '}
                          {formatBaseQty(row.availableBase, row.unitType, row.displayUnit)} in stock ·{' '}
                          {formatBaseQty(row.afterBase, row.unitType, row.displayUnit)} after
                        </Text>
                      </View>
                      {short ? (
                        <View style={styles.shortBadge}>
                          <Feather name="alert-triangle" size={12} color={colors.danger} />
                          <Text style={styles.shortBadgeText}>
                            +{formatBaseQty(row.shortfallBase, row.unitType, row.displayUnit)}
                          </Text>
                        </View>
                      ) : (
                        <Feather name="check-circle" size={18} color={colors.primary} />
                      )}
                    </View>
                  );
                })
              )}
              {plan?.hasShortage ? (
                <Text style={styles.shortSummary}>
                  Insufficient stock. You need an additional{' '}
                  {plan.rows
                    .filter((r) => r.shortfallBase > 0)
                    .map(
                      (r) => `${formatBaseQty(r.shortfallBase, r.unitType, r.displayUnit)} of ${r.name}`,
                    )
                    .join(', ')}
                  .
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.hint}>Enter a quantity to preview the materials this batch will use.</Text>
          )}

          <Text style={[styles.label, styles.inputGap]}>Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth remembering about this batch"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.notesInput]}
            multiline
          />

          <PrimaryButton
            title={saving ? 'Producing…' : `Produce ${validQty ? qty : ''} ${unitWord}`}
            onPress={onProduce}
            disabled={saving || !validQty || !selectedRecipe || Boolean(plan?.hasShortage)}
            icon="play-circle"
            style={styles.produceBtn}
          />
          {plan?.hasShortage ? (
            <Text style={styles.blockedNote}>
              Restock the highlighted materials to enable production.
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
  },
  inputGap: { marginTop: spacing.md },
  recipeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recipeChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  recipeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rateHint: {
    marginTop: spacing.xs,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  recipeChipText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  recipeChipTextActive: { color: colors.textOnPrimary, fontFamily: fonts.semiBold },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  qtyUnit: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    minWidth: 48,
  },
  maxLine: {
    marginTop: spacing.xs,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  maxStrong: { fontFamily: fonts.semiBold, color: colors.text },
  hint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  planTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  planEmpty: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  planRowBody: { flex: 1 },
  planName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  planMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  shortBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shortBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs - 1,
    color: colors.danger,
  },
  shortSummary: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  produceBtn: { marginTop: spacing.lg },
  blockedNote: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
