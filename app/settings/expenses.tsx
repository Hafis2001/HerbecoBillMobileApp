/**
 * Expenses screen — Settings → Expenses.
 * Add, view and delete expense entries. Each expense is tagged as cash or bank.
 * These expenses are subtracted from the respective cash/bank totals on the Dashboard.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
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
import theme from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { showToast } from '../../components/Toast';
import PrimaryButton from '../../components/PrimaryButton';
import { getExpenses, saveExpense, deleteExpense } from '../../store/invoiceDb';
import { formatINR, formatDateTime } from '../../utils/format';
import { makeId } from '../../store/productStore';
import type { Expense } from '../../types';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

const CATEGORIES = ['Food', 'Transport', 'Utilities', 'Supplies', 'Salary', 'Rent', 'Other'];

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const { width, isTablet, maxContentWidth } = useResponsive();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidVia, setPaidVia] = useState<'cash' | 'bank'>('cash');
  const [category, setCategory] = useState('Other');

  const loadExpenses = useCallback(async () => {
    try {
      const data = await getExpenses();
      setExpenses(data);
    } catch {
      showToast('Could not load expenses', 'error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const totalCash = expenses.reduce((s, e) => (e.paidVia === 'cash' ? s + e.amount : s), 0);
  const totalBank = expenses.reduce((s, e) => (e.paidVia === 'bank' ? s + e.amount : s), 0);

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setPaidVia('cash');
    setCategory('Other');
  };

  const onAddExpense = async () => {
    const trimmed = description.trim();
    const val = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (!trimmed) { showToast('Enter a description', 'error'); return; }
    if (!val || val <= 0) { showToast('Enter a valid amount', 'error'); return; }

    setLoading(true);
    try {
      const expense: Expense = {
        id: makeId(),
        description: trimmed,
        amount: val,
        paidVia,
        category,
        createdAtMs: Date.now(),
      };
      await saveExpense(expense);
      await loadExpenses();
      resetForm();
      setShowForm(false);
      showToast('Expense added');
    } catch {
      showToast('Could not save expense', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = (expense: Expense) => {
    Alert.alert('Delete Expense', `Delete "${expense.description}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExpense(expense.id);
            await loadExpenses();
            showToast('Expense deleted');
          } catch {
            showToast('Could not delete expense', 'error');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.mainWrap, isTablet && { maxWidth: maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Expenses</Text>
          <Pressable
            onPress={() => setShowForm(true)}
            accessibilityLabel="Add expense"
            hitSlop={8}
          >
            <Feather name="plus-circle" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, cardShadow]}>
            <Text style={styles.summaryLabel}>Cash Expenses</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>{formatINR(totalCash)}</Text>
          </View>
          <View style={[styles.summaryCard, cardShadow]}>
            <Text style={styles.summaryLabel}>Bank Expenses</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatINR(totalBank)}</Text>
          </View>
        </View>

        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="file-minus" size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <Text style={styles.emptyText}>Tap the + button to record an expense.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.expenseRow, cardShadow]}>
              <View style={[styles.expenseIcon, { backgroundColor: item.paidVia === 'cash' ? colors.goldSoft : colors.accentSoft }]}>
                <Feather
                  name={item.paidVia === 'cash' ? 'dollar-sign' : 'credit-card'}
                  size={16}
                  color={item.paidVia === 'cash' ? colors.gold : colors.primary}
                />
              </View>
              <View style={styles.expenseBody}>
                <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.expenseMeta}>
                  {item.category} · {item.paidVia === 'cash' ? 'Cash' : 'Bank'} · {formatDateTime(new Date(item.createdAtMs).toISOString())}
                </Text>
              </View>
              <View style={styles.expenseRight}>
                <Text style={styles.expenseAmount}>{formatINR(item.amount)}</Text>
                <Pressable onPress={() => onDelete(item)} hitSlop={8} accessibilityLabel="Delete expense">
                  <Feather name="trash-2" size={15} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          )}
        />
      </View>

      {/* Add Expense Modal */}
      <Modal
        visible={showForm}
        animationType="slide"
        transparent
        onRequestClose={() => { resetForm(); setShowForm(false); }}
      >
        <Pressable style={styles.scrim} onPress={() => { resetForm(); setShowForm(false); }} />
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
          <Text style={styles.sheetTitle}>Add Expense</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Description</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Office supplies"
                placeholderTextColor={colors.textMuted}
                style={styles.textInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.textInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Paid Via</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggleBtn, paidVia === 'cash' && styles.toggleBtnActive]}
                onPress={() => setPaidVia('cash')}
              >
                <Feather name="dollar-sign" size={14} color={paidVia === 'cash' ? colors.textOnPrimary : colors.text} />
                <Text style={[styles.toggleText, paidVia === 'cash' && styles.toggleTextActive]}>Cash</Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, paidVia === 'bank' && styles.toggleBtnActive]}
                onPress={() => setPaidVia('bank')}
              >
                <Feather name="credit-card" size={14} color={paidVia === 'bank' ? colors.textOnPrimary : colors.text} />
                <Text style={[styles.toggleText, paidVia === 'bank' && styles.toggleTextActive]}>Bank / UPI</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.catChip, category === cat && styles.catChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>

            <PrimaryButton
              title={loading ? 'Saving…' : 'Add Expense'}
              onPress={() => void onAddExpense()}
              disabled={loading}
              icon="plus"
              style={{ marginTop: spacing.md }}
            />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mainWrap: { flex: 1 },
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
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  summaryLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    marginTop: 4,
  },
  list: { paddingHorizontal: spacing.md },
  empty: { alignItems: 'center', paddingTop: spacing.xl * 2, gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.semiBold, fontSize: fontSize.md, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.textMuted },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  expenseIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expenseBody: { flex: 1 },
  expenseDesc: { fontFamily: fonts.semiBold, fontSize: fontSize.sm, color: colors.text },
  expenseMeta: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
    marginTop: 2,
  },
  expenseRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  expenseAmount: { fontFamily: fonts.bold, fontSize: fontSize.md, color: colors.danger },

  // Modal
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
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: 6,
    marginTop: spacing.md,
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
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 4,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  toggleTextActive: { color: colors.textOnPrimary },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  catChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  catChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  catChipText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  catChipTextActive: { color: colors.primary },
});
