/**
 * WhatsApp helpers.
 *
 * A WhatsApp deep link can open ONE specific chat, but it cannot attach a
 * file, so the two halves travel separately:
 * 1) `whatsapp://send?phone=<number>` opens the customer's chat directly with
 *    the greeting already typed in — no contact picker.
 * 2) The PDF goes out through the OS share sheet (expo-sharing).
 */

import { Alert, Linking } from 'react-native';
import { formatINRShort } from './format';

/** Pre-filled thank-you greeting for the customer. */
export function buildGreetingMessage(customerName: string, grandTotal: number): string {
  return (
    `Hello ${customerName}, thank you for purchasing from HERBECO! 🌿\n` +
    `Your bill total is ${formatINRShort(grandTotal)}. We appreciate your trust ` +
    `and look forward to serving you again.`
  );
}

/** Normalises a 10-digit Indian number typed by the user (strips +91 / 0). */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/**
 * Opens the customer's WhatsApp chat directly, with the message pre-typed.
 *
 * The `whatsapp://send?phone=` scheme is tried first because it lands straight
 * in the app on that number. `https://wa.me/` is the fallback (it opens
 * WhatsApp too, but via a browser round-trip). `canOpenURL` is deliberately
 * skipped: on Android 11+ it reports false for schemes the app has not
 * declared in its manifest, which would send us down the slow path every time.
 */
export async function openWhatsAppChat(phone: string, text: string): Promise<boolean> {
  const numbers = normalizePhone(phone);
  if (!numbers) {
    Alert.alert('No number on this bill', 'Add the customer\'s mobile number and try again.');
    return false;
  }

  const encoded = encodeURIComponent(text);
  const deepLink = `whatsapp://send?phone=91${numbers}&text=${encoded}`;
  const waMe = `https://wa.me/91${numbers}?text=${encoded}`;

  try {
    await Linking.openURL(deepLink);
    return true;
  } catch {
    // WhatsApp is missing or the scheme was refused — try the web link.
  }

  try {
    await Linking.openURL(waMe);
    return true;
  } catch {
    Alert.alert(
      'WhatsApp not found',
      'It looks like WhatsApp is not installed on this phone. Please install WhatsApp and try again.',
      [{ text: 'OK' }],
    );
    return false;
  }
}
