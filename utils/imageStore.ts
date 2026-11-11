/**
 * Copies a picked photo into documentDirectory/herbeco so it survives app
 * restarts — the same strategy add-product uses for product photos.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { makeId } from '../store/productStore';

export async function persistImage(sourceUri: string): Promise<string> {
  try {
    const dir = `${FileSystem.documentDirectory}herbeco`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const dest = `${dir}/${makeId()}.jpg`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    return sourceUri;
  }
}
