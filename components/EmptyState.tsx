/**
 * Friendly empty state with a leaf illustration and optional action button.
 */

import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import PrimaryButton from './PrimaryButton';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof Feather.glyphMap;
}

export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  icon = 'feather',
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.illustration}>
        <View style={styles.circleOuter}>
          <View style={styles.circleInner}>
            <Feather name={icon} size={36} color={colors.primary} />
          </View>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <PrimaryButton title={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl + 16,
    paddingHorizontal: spacing.lg,
  },
  illustration: {
    marginBottom: spacing.md,
  },
  circleOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
    shadowRadius: 6,
  },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  action: {
    marginTop: spacing.md,
    minWidth: 220,
  },
});

export default EmptyState;
