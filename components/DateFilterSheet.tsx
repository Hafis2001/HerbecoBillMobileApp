/**
 * Date filter sheet for the Bills tab.
 *
 * Two ways to narrow the list:
 *   • Specific date — one day, e.g. everything billed on 05 Nov 2026
 *   • From – To     — a range, both ends included
 *
 * The calendar is drawn here so the app needs no extra native date-picker
 * dependency. Future days are disabled: a bill can never be dated later.
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export interface DateFilterValue {
  mode: 'single' | 'range';
  /** Day start (ms) the filter begins at. */
  fromMs: number;
  /** Day start (ms) the filter ends at — same as `fromMs` for a single day. */
  toMs: number;
}

interface Props {
  visible: boolean;
  /** Current filter, so re-opening the sheet keeps what was chosen. */
  initial: DateFilterValue | null;
  onClose: () => void;
  /** `null` when the date filter was cleared. */
  onApply: (value: DateFilterValue | null) => void;
}

const DAY_MS = 86400000;

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Days of a month laid out Monday-first, padded with nulls to whole weeks. */
function monthCells(year: number, month: number): Array<number | null> {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day).getTime());
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const monthLabel = (year: number, month: number): string =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1),
  );

export default function DateFilterSheet({ visible, initial, onClose, onApply }: Props) {
  const today = useMemo(() => startOfDay(Date.now()), []);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [fromMs, setFromMs] = useState<number | null>(null);
  const [toMs, setToMs] = useState<number | null>(null);
  /** Which end of a range the next calendar tap sets. */
  const [picking, setPicking] = useState<'from' | 'to'>('from');
  const [view, setView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Reopening the sheet starts from the filter that is currently applied.
  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setMode(initial.mode);
      setFromMs(startOfDay(initial.fromMs));
      setToMs(startOfDay(initial.toMs));
    } else {
      setMode('single');
      setFromMs(null);
      setToMs(null);
    }
    setPicking('from');
    const anchor = new Date(initial ? initial.toMs : Date.now());
    setView({ year: anchor.getFullYear(), month: anchor.getMonth() });
  }, [visible, initial]);

  const cells = useMemo(() => monthCells(view.year, view.month), [view]);

  const shiftMonth = (delta: number) => {
    setView((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const pickDay = (dayMs: number) => {
    if (mode === 'single') {
      setFromMs(dayMs);
      setToMs(dayMs);
      return;
    }
    if (picking === 'from') {
      setFromMs(dayMs);
      setToMs(dayMs);
      setPicking('to');
    } else {
      // Tapping before the start simply flips the ends.
      const start = fromMs !== null && fromMs <= dayMs ? fromMs : dayMs;
      setFromMs(start);
      setToMs(dayMs);
      setPicking('from');
    }
  };

  const setToday = (offsetDays = 0) => {
    const day = startOfDay(Date.now() - offsetDays * DAY_MS);
    setFromMs(day);
    setToMs(day);
  };

  const setThisMonth = () => {
    const now = new Date();
    setFromMs(new Date(now.getFullYear(), now.getMonth(), 1).getTime());
    setToMs(today);
  };

  const canApply =
    fromMs !== null && (mode === 'single' ? true : toMs !== null);
  const rangeStart = fromMs;
  const rangeEnd = mode === 'single' ? fromMs : toMs;

  const handleApply = () => {
    if (fromMs === null) return;
    const end = mode === 'single' ? fromMs : toMs ?? fromMs;
    onApply({ mode, fromMs, toMs: end });
    onClose();
  };

  const handleClear = () => {
    onApply(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, cardShadow]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Filter by date</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close date filter">
              <Feather name="x" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.segment}>
            {(['single', 'range'] as const).map((key) => {
              const active = mode === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setMode(key);
                    setPicking('from');
                    if (key === 'single' && fromMs !== null) setToMs(fromMs);
                  }}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {key === 'single' ? 'Specific date' : 'From – To'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'range' ? (
            <View style={styles.rangeRow}>
              <Pressable
                onPress={() => setPicking('from')}
                style={[styles.rangePill, picking === 'from' && styles.rangePillActive]}
              >
                <Text style={styles.rangeLabel}>From</Text>
                <Text style={[styles.rangeValue, picking === 'from' && styles.rangeValueActive]}>
                  {rangeStart === null ? 'Pick a day' : formatShort(rangeStart)}
                </Text>
              </Pressable>
              <Feather name="arrow-right" size={15} color={colors.textMuted} />
              <Pressable
                onPress={() => {
                  if (fromMs !== null) setPicking('to');
                }}
                style={[styles.rangePill, picking === 'to' && styles.rangePillActive]}
              >
                <Text style={styles.rangeLabel}>To</Text>
                <Text style={[styles.rangeValue, picking === 'to' && styles.rangeValueActive]}>
                  {toMs === null ? 'Pick a day' : formatShort(toMs)}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.quickRow}>
            <Pressable onPress={() => setToday(0)} style={styles.quickChip}>
              <Text style={styles.quickText}>Today</Text>
            </Pressable>
            <Pressable onPress={() => setToday(1)} style={styles.quickChip}>
              <Text style={styles.quickText}>Yesterday</Text>
            </Pressable>
            {mode === 'range' ? (
              <Pressable onPress={setThisMonth} style={styles.quickChip}>
                <Text style={styles.quickText}>This month</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.monthBar}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.monthBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel(view.year, view.month)}</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.monthBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, index) => {
              if (day === null) {
                return <View key={`blank-${index}`} style={styles.dayCell} />;
              }
              const isFuture = day > today;
              const isStart = rangeStart !== null && day === rangeStart;
              const isEnd = rangeEnd !== null && day === rangeEnd;
              const withinRange =
                rangeStart !== null &&
                rangeEnd !== null &&
                day >= rangeStart &&
                day <= rangeEnd;
              const isToday = day === today;
              return (
                <Pressable
                  key={day}
                  disabled={isFuture}
                  onPress={() => pickDay(day)}
                  accessibilityRole="button"
                  accessibilityLabel={new Date(day).toDateString()}
                  style={styles.dayCell}
                >
                  <View
                    style={[
                      styles.dayInner,
                      withinRange && styles.dayInRange,
                      (isStart || isEnd) && styles.daySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        withinRange && styles.dayTextInRange,
                        (isStart || isEnd) && styles.dayTextSelected,
                        isFuture && styles.dayTextDisabled,
                        isToday && !isStart && !isEnd && styles.dayTextToday,
                      ]}
                    >
                      {new Date(day).getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={handleClear}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={handleApply}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              style={({ pressed }) => [
                styles.applyBtn,
                !canApply && styles.applyBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.applyText}>Show bills</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** "05 Nov" — used on the From/To pills. */
function formatShort(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(
    new Date(ms),
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md + 8,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  segmentTextActive: { color: colors.textOnPrimary, fontFamily: fonts.semiBold },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rangePill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
  },
  rangePillActive: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  rangeLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  rangeValue: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    marginTop: 1,
  },
  rangeValueActive: { color: colors.primary },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm + 2,
    minHeight: 30,
    justifyContent: 'center',
  },
  quickText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.primary,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
  },
  monthBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  monthLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm + 1,
    color: colors.text,
  },
  weekRow: { flexDirection: 'row', marginTop: spacing.sm },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: fontSize.xs - 1,
    color: colors.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  dayCell: {
    width: `${100 / 7}%`,
    paddingVertical: 2,
    alignItems: 'center',
  },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInRange: { backgroundColor: colors.accentSoft, borderRadius: radius.pill },
  daySelected: { backgroundColor: colors.primary },
  dayText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs + 1,
    color: colors.text,
  },
  dayTextInRange: { color: colors.primaryDark },
  dayTextSelected: { color: colors.textOnPrimary, fontFamily: fonts.semiBold },
  dayTextDisabled: { color: colors.border },
  dayTextToday: { color: colors.gold, fontFamily: fonts.bold },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  clearBtn: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  applyBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnDisabled: { backgroundColor: colors.border },
  applyText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textOnPrimary,
  },
});
