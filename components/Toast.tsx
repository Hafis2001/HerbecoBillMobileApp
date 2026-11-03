/**
 * Lightweight toast/snackbar: a tiny global store + auto-hiding host view.
 * Usage anywhere: showToast('Added to cart', 'success').
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { create } from 'zustand';
import theme from '../constants/theme';

const { colors, radius, spacing, fonts, fontSize, cardShadow } = theme;

type ToastType = 'success' | 'error';

interface ToastState {
  message: string | null;
  type: ToastType;
  show: (message: string, type?: ToastType) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'success',
  show: (message, type = 'success') => set({ message, type }),
  hide: () => set({ message: null }),
}));

export function showToast(message: string, type: ToastType = 'success'): void {
  useToastStore.getState().show(message, type);
}

export function ToastHost() {
  const { message, type, hide } = useToastStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, 2200);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, hide]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View
        key={`${message}-${type}`}
        entering={FadeInDown.duration(200)}
        exiting={FadeOutDown.duration(180)}
        style={[styles.toast, type === 'error' ? styles.errorBg : styles.successBg, cardShadow]}
      >
        <Feather
          name={type === 'error' ? 'alert-circle' : 'check-circle'}
          size={18}
          color={colors.textOnPrimary}
        />
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 120,
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '88%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 12,
  },
  successBg: { backgroundColor: colors.primary },
  errorBg: { backgroundColor: colors.danger },
  text: {
    color: colors.textOnPrimary,
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
  },
});

export default ToastHost;
