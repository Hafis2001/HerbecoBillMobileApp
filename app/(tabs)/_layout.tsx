/**
 * Bottom tab bar order: Dashboard, Home (normal price), Referral (+10%),
 * Products, Bills and Settings.
 *
 * Six tabs have to fit on a 320dp phone, so labels are 9–10px, never scale
 * with the system font size, and the bar's height/padding follow the device
 * safe-area inset (gesture bar, 3-button nav, iPhone home indicator).
 */

import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';

const { colors, fonts } = theme;

/** Height of the bar's own content (icon + label), before the system inset. */
const BAR_CONTENT_HEIGHT = 56;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Six tabs share the width, so labels stay small enough that "Dashboard"
  // never clips on a 320–360dp phone.
  const labelSize = width < 360 ? 8 : 9;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [
          styles.tabBar,
          { height: BAR_CONTENT_HEIGHT + insets.bottom, paddingBottom: insets.bottom + 4 },
        ],
        tabBarLabelStyle: [styles.label, { fontSize: labelSize }],
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.icon,
        tabBarAllowFontScaling: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <Feather name="bar-chart-2" size={20} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={20} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="referral"
        options={{
          title: 'Referral',
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={20} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color }) => (
            <Feather name="file-text" size={20} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Feather name="sliders" size={20} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  item: {
    paddingVertical: 0,
    justifyContent: 'center',
  },
  icon: {
    marginBottom: 0,
  },
  label: {
    fontFamily: fonts.semiBold,
    marginTop: 2,
    marginBottom: 0,
  },
});
