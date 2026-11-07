/**
 * Invoice PDF generation + sharing (used by the bill screen AND the Bills tab).
 *
 * Speed notes:
 * - The logo data URI is loaded once per app session and cached in memory.
 * - The generated PDF itself is cached on disk per invoice number, so
 *   re-sharing a bill (Bills tab) skips regeneration entirely.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import type { Invoice } from '../types';
import { buildInvoiceHtml } from './billTemplate';
import { buildGreetingMessage, openWhatsAppChat } from './whatsapp';
import { showToast } from '../components/Toast';

const { documentDirectory, readAsStringAsync, EncodingType } = FileSystem;

/**
 * Bump this whenever the invoice template changes (shop address, logo, layout).
 * It is part of the cached PDF filename, so old copies are never re-used with
 * outdated details.
 */
// Bumped to v4: bills no longer print the referral badge / "Referral:" line,
// so cached PDFs from v3 must be regenerated.
const TEMPLATE_VERSION = 'v4';

/* ------------------------------------------------------------------ */
/* Logo loading (cached)                                               */
/* ------------------------------------------------------------------ */

let logoPromise: Promise<string | null> | null = null;

/** Loads assets/logo.png as a data URI for the PDF header (cached forever). */
function getLogoDataUri(): Promise<string | null> {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const { Asset } = await import('expo-asset');
        const asset = Asset.fromModule(require('../assets/logo.png'));
        await asset.downloadAsync();
        if (asset.localUri) {
          const base64 = await readAsStringAsync(asset.localUri, {
            encoding: EncodingType.Base64,
          });
          if (base64) return `data:image/png;base64,${base64}`;
        }
      } catch (e) {
        console.log('logo load error', e);
      }
      // Fallback: try to read directly from assets folder if possible
      try {
        const base64 = await readAsStringAsync(require('../assets/logo.png') as any, {
          encoding: EncodingType.Base64,
        }).catch(() => null);
        if (base64) return `data:image/png;base64,${base64}`;
      } catch {}
      return null; // PDF renders without the logo if this fails
    })();
  }
  return logoPromise;
}

/* ------------------------------------------------------------------ */
/* PDF generation (cached per invoice number)                          */
/* ------------------------------------------------------------------ */

/**
 * Path of the cached PDF for an invoice, or null when the app has no
 * document directory (then every share regenerates the PDF).
 */
async function pdfCachePath(invoiceNumber: string): Promise<string | null> {
  if (!documentDirectory) return null;
  const dir = `${documentDirectory}bills/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch (e) {
    console.log('could not prepare bills dir', e);
    return null;
  }
  return `${dir}${invoiceNumber}-${TEMPLATE_VERSION}.pdf`;
}

/**
 * Renders the invoice HTML and puts the PDF inside the app's document
 * directory.
 *
 * `expo-print` writes its output to the app's global cache directory, which
 * Expo Go does not let expo-file-system or expo-sharing touch — files there
 * fail with "isn't readable"/"isn't movable" and "Not allowed to read file".
 * Asking the printer for the bytes (`base64: true`) and writing the file
 * ourselves keeps it inside the project sandbox, which both APIs can read.
 */
async function renderPdf(invoice: Invoice): Promise<string> {
  const logoDataUri = await getLogoDataUri().catch(() => null);
  const html = buildInvoiceHtml(invoice, logoDataUri);
  const cachePath = await pdfCachePath(invoice.number);

  if (cachePath) {
    try {
      const { base64 } = await Print.printToFileAsync({ html, base64: true });
      if (base64) {
        await FileSystem.writeAsStringAsync(cachePath, base64, {
          encoding: EncodingType.Base64,
        });
        const info = await FileSystem.getInfoAsync(cachePath);
        if (info.exists && (info.size ?? 0) > 0) return cachePath;
      }
    } catch (e) {
      console.log('could not save the PDF into the document directory', e);
    }
  }

  // Fall back to the printer's own temp file (works in a standalone build).
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
}

/**
 * Drops the cached PDF for a bill number. Call this after editing a saved
 * bill, otherwise the old copy on disk would be shared again.
 */
export async function invalidateInvoicePdf(invoiceNumber: string): Promise<void> {
  const path = await pdfCachePath(invoiceNumber);
  if (!path) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch (e) {
    console.log('could not clear the cached PDF', e);
  }
}

/**
 * Returns a local file URI for the invoice's PDF. Generates it only if a
 * cached copy does not already exist on disk.
 */
export async function getInvoicePdfUri(invoice: Invoice): Promise<string> {
  const cachePath = await pdfCachePath(invoice.number);

  if (cachePath) {
    try {
      const cached = await FileSystem.getInfoAsync(cachePath);
      if (cached.exists && (cached.size ?? 0) > 0) return cachePath;
    } catch {
      // unreadable cache — fall through and regenerate
    }
  }

  return renderPdf(invoice);
}

/* ------------------------------------------------------------------ */
/* Sharing                                                            */
/* ------------------------------------------------------------------ */

/** Opens the OS share sheet with the bill PDF (user picks WhatsApp etc.). */
export async function shareInvoicePdf(invoice: Invoice): Promise<void> {
  const available = await Sharing.isAvailableAsync().catch(() => false);
  if (!available) {
    Alert.alert(
      'Sharing unavailable',
      'This device cannot open the share sheet. Please try again from a different device or app.',
    );
    return;
  }

  const shareOptions = {
    mimeType: 'application/pdf',
    dialogTitle: `${invoice.number}.pdf`,
    UTI: 'com.adobe.pdf',
  } as const;

  const isCancel = (e: unknown) => /cancel/i.test(String((e as any)?.message ?? e));

  // 1st attempt: the PDF stored in the project's document directory.
  try {
    const uri = await getInvoicePdfUri(invoice);
    console.log('sharing bill pdf from', uri);
    await Sharing.shareAsync(uri, shareOptions);
    return;
  } catch (e) {
    if (isCancel(e)) return;
    console.log('shareInvoicePdf attempt 1 failed', e);
  }

  // 2nd attempt: print a fresh copy and share straight from the printer.
  try {
    const logoDataUri = await getLogoDataUri().catch(() => null);
    const { uri } = await Print.printToFileAsync({
      html: buildInvoiceHtml(invoice, logoDataUri),
    });
    console.log('sharing bill pdf from', uri);
    await Sharing.shareAsync(uri, shareOptions);
    return;
  } catch (e) {
    if (isCancel(e)) return;
    console.log('shareInvoicePdf attempt 2 failed', e);
    Alert.alert(
      'Could not share bill',
      'The PDF was created but the share sheet could not open it. Try the "Share PDF" button instead, or reopen the app.',
    );
  }
}

/**
 * Opens the customer's own WhatsApp chat with the greeting already typed in.
 *
 * The greeting belongs to THIS action only. "Share PDF" stays silent: it just
 * hands the document to the share sheet, with no message and nothing copied to
 * the clipboard.
 */
export async function shareInvoiceOnWhatsApp(invoice: Invoice): Promise<void> {
  const greeting = buildGreetingMessage(invoice.customer.name, invoice.grandTotal);
  const opened = await openWhatsAppChat(invoice.customer.phone, greeting);
  if (opened) {
    showToast(`Opening WhatsApp chat with ${invoice.customer.name}`);
  }
}

/** Steps shown in the UI so the owner understands the two-step send. */
export function showWhatsAppGuide(): void {
  Alert.alert(
    'Send bill on WhatsApp',
    'The WhatsApp button opens the customer\'s chat directly — the number on the bill is used, so there is no contact list to search:\n\n1. WhatsApp opens on that number with the greeting already typed in — press send.\n2. WhatsApp cannot attach a file from a link, so the PDF is sent separately with the "Share PDF" button. That button sends only the document — no message is attached to it.',
    [{ text: 'Got it' }],
  );
}
