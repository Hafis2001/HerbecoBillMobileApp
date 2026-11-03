/**
 * Bottom tab bar: Home (normal price), Referral (+10%) and Products.
 */

import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../constants/theme';

const { colors, fonts, fontSize } = theme;

/** Height of the bar's own content (icon + label), before the system inset. */
const BAR_CONTENT_HEIGHT = 58;

export default function TabsLayout() {
  // Every device has a different bottom inset (gesture bar, 3-button nav,
  // iPhone home indicator). Adding it to the height and padding keeps the
  // icons and labels above the system bar instead of clipped or overlapped.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [
          styles.tabBar,
          { height: BAR_CONTENT_HEIGHT + insets.bottom, paddingBottom: insets.bottom + 6 },
        ],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.icon,
        tabBarAllowFontScaling: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="referral"
        options={{
          title: 'Referral',
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: ({ color }) => (
            <Feather name="package" size={22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color }) => (
            <Feather name="file-text" size={22} color={String(color)} />
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
    paddingTop: 8,
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
    // 10px keeps "Referral" on one line on 320dp-wide phones.
    fontSize: 10,
    marginTop: 2,
    marginBottom: 0,
  },
});
