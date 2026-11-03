/**
 * Root layout: loads the Poppins font family, keeps the splash visible until
 * fonts are ready, and hosts all routes. Global toast host lives here.
 */

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from '@expo-google-fonts/poppins';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '../components/Toast';
import theme from '../constants/theme';
import { purgeExpiredInvoices } from '../store/invoiceDb';

// Keep the native splash up while fonts load.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void purgeExpiredInvoices(30).catch(() => {});
  }, []);

  if (!fontsLoaded && !fontError) {
    return null; // splash stays visible
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.flex}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="add-product" options={{ presentation: 'modal' }} />
            <Stack.Screen name="cart" />
            <Stack.Screen name="bill" options={{ gestureEnabled: false }} />
          </Stack>
          <ToastHost />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
