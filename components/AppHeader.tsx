/**
 * Screen header for the tabs: HERBECO logo + name (brand block), optional
 * right-side action (e.g. cart icon with item-count badge, or Add button).
 */

import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

interface AppHeaderProps {
  /** Feather icon for the right action; omit for none. */
  rightIcon?: keyof typeof Feather.glyphMap;
  /** Badge number shown over the right icon (e.g. cart item count). */
  rightBadge?: number;
  onRightPress?: () => void;
  rightAccessibilityLabel?: string;
}

export function AppHeader({
  rightIcon,
  rightBadge,
  onRightPress,
  rightAccessibilityLabel,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm + 2 }]}>
      {/* Brand block: assets/logo.png is the HERBECO wordmark */}
      <View style={styles.brandText}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="HERBECO, farm to table"
        />
      </View>

      {rightIcon ? (
        <Pressable
          accessibilityLabel={rightAccessibilityLabel}
          onPress={onRightPress}
          style={({ pressed }) => [styles.rightBtn, cardShadow, pressed && { opacity: 0.85 }]}
          hitSlop={6}
        >
          <Feather name={rightIcon} size={21} color={colors.primary} />
          {typeof rightBadge === 'number' && rightBadge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{rightBadge > 99 ? '99+' : rightBadge}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 2,
    backgroundColor: colors.background,
  },
  logo: {
    width: 116,
    height: 52,
  },
  brandText: {
    flex: 1,
  },
  rightBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.textOnPrimary,
  },
  spacer: {
    width: 44,
  },
});

export default AppHeader;
