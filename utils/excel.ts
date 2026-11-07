/**
 * Excel download for the Bills tab.
 *
 * The file is a UTF-8 CSV with a BOM, which Excel (and Google Sheets / WPS)
 * opens natively as a spreadsheet. Only customer information is exported —
 * name, phone number and total amount — for exactly the bills passed in (so
 * the date filter decides what lands in the file).
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import type { InvoiceRecord } from '../types';
import { showToast } from '../components/Toast';

/** Quotes a cell and escapes embedded quotes — safe for names with commas. */
const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Header + one row per bill. Kept separate so it is easy to unit-test. */
export function buildBillsCsv(records: InvoiceRecord[]): string {
  const header = ['Customer Name', 'Phone Number', 'Total Amount'].join(',');
  const rows = records.map((record) =>
    [
      csvCell(record.customerName),
      csvCell(`+91${record.customerPhone}`),
      record.grandTotal.toFixed(2),
    ].join(','),
  );
  // CRLF keeps Excel happy on Windows; the BOM (added on write) makes ₹/accents safe.
  return [header, ...rows].join('\r\n');
}

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'all';

/**
 * Writes the CSV into the app's documents folder and opens the share sheet so
 * the owner can save it to Files / Drive / send it on WhatsApp.
 */
export async function exportBillsToCsv(
  records: InvoiceRecord[],
  label: string,
): Promise<void> {
  if (records.length === 0) {
    showToast('No bills to download for this date filter', 'error');
    return;
  }

  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) {
    Alert.alert(
      'Download unavailable',
      'This device did not provide a storage folder. Try again after restarting the app.',
    );
    return;
  }

  try {
    const folder = `${root}exports/`;
    const info = await FileSystem.getInfoAsync(folder);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `herbeco-bills-${slug(label)}-${stamp}.csv`;
    const uri = `${folder}${filename}`;

    // \uFEFF = UTF-8 BOM, so Excel reads the file as UTF-8 instead of ANSI.
    await FileSystem.writeAsStringAsync(uri, `\uFEFF${buildBillsCsv(records)}`, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const available = await Sharing.isAvailableAsync().catch(() => false);
    if (!available) {
      Alert.alert('Download ready', `Saved on this device as ${filename}.`);
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: filename,
      UTI: 'public.comma-separated-values-text',
    });
    showToast(`Excel file ready · ${records.length} bill(s)`);
  } catch (error) {
    console.log('exportBillsToCsv failed', error);
    showToast('Could not create the Excel file', 'error');
  }
}
