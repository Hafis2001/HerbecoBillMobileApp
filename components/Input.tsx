/**
 * Labeled text input with inline error text; used by react-hook-form.
 */

import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, StyleProp } from 'react-native';
import theme from '../constants/theme';

const { colors, radius, spacing, fonts, fontSize } = theme;

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({ label, error, containerStyle, style, ...rest }: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, Boolean(error) && styles.inputError, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.danger,
    fontFamily: fonts.regular,
  },
});

export default Input;
