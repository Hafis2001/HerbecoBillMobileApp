/**
 * Brand-styled primary button with a subtle press animation (Reanimated),
 * built-in disabled state and three visual variants.
 */

import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, TextStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import theme from '../constants/theme';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'gold';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}

const bgFor: Record<ButtonVariant, string> = {
  primary: colors.primary,
  ghost: 'transparent',
  danger: colors.danger,
  gold: colors.gold,
};

const textFor: Record<ButtonVariant, string> = {
  primary: colors.textOnPrimary,
  ghost: colors.primary,
  danger: colors.textOnPrimary,
  gold: colors.textOnPrimary,
};

export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  style,
  small = false,
}: PrimaryButtonProps) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value, { damping: 18, stiffness: 300 }) }],
  }));

  const ghostBorder =
    variant === 'ghost'
      ? { borderWidth: 1.5, borderColor: disabled ? colors.border : colors.primary }
      : null;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          setPressed(true);
          scale.value = 0.96;
        }}
        onPressOut={() => {
          setPressed(false);
          scale.value = 1;
        }}
        style={(state) => [
          styles.button,
          small && styles.buttonSmall,
          { backgroundColor: bgFor[variant] },
          ghostBorder,
          variant !== 'ghost' && !disabled && cardShadow,
          disabled && styles.disabled,
          Boolean(state.pressed) && variant !== 'ghost' && styles.pressedDim,
          style,
        ]}
      >
        {icon ? (
          <Feather
            name={icon}
            size={small ? 16 : 20}
            color={textFor[variant]}
            style={styles.icon}
          />
        ) : null}
        <Text
          style={[
            styles.text as TextStyle,
            small && styles.textSmall,
            { color: textFor[variant] },
            variant === 'ghost' && disabled && styles.disabledText,
            variant === 'ghost' && !disabled && { color: colors.primary },
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonSmall: {
    minHeight: 40,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  textSmall: {
    fontSize: fontSize.sm,
  },
  disabled: {
    opacity: 0.55,
  },
  disabledText: {
    color: colors.textMuted,
  },
  pressedDim: {
    opacity: 0.9,
  },
  icon: {
    marginRight: 2,
  },
});

export default PrimaryButton;
