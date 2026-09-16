// The shop's own marks on its paperwork: a logo at the top of the bill and a
// signature at the bottom.
//
// Like item photos (modules/items/images.ts), a picked file is copied into the
// app's own document directory before its uri is stored — the picker hands back
// something in the OS cache, which Android is free to wipe, and a bill printed
// next month must not come out with a hole where the logo was.

import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { isWeb } from '@/utils/webFile';

const FOLDER = 'brand-images';

/**
 * A picked image, in a browser, as the data: uri that gets stored.
 *
 * There is no document directory on web to copy into, and the picker hands back
 * the original file untouched — its quality and crop options are ignored there —
 * so a phone photo would be megabytes in the database. It is drawn onto a canvas
 * no larger than `maxPx` on its long side first. PNG keeps a logo's transparency.
 */
export function webImageDataUri(
  blobUri: string,
  maxPx: number,
  type: 'image/png' | 'image/jpeg',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('This browser cannot read the picture.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(type, 0.8));
    };
    img.onerror = () => reject(new Error('That file could not be read as a picture.'));
    img.src = blobUri;
  });
}

export type BrandImage = 'logo' | 'signature';

function brandDir(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function keep(sourceUri: string, kind: BrandImage): string {
  const src = new File(sourceUri);
  const ext = src.extension || '.png';
  const target = new File(brandDir(), `${kind}-${Date.now()}${ext}`);
  src.copy(target);
  return target.uri;
}

/**
 * Pick a logo or signature from the gallery. A logo is squarish and a signature
 * is wide, so each is cropped to the shape it will be printed in.
 */
export async function pickBrandImage(kind: BrandImage): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo permission is needed to choose an image.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: kind === 'logo' ? [1, 1] : [3, 1],
    quality: 0.8, // it is printed, so keep more detail than an item tile needs
  });
  if (res.canceled || !res.assets?.[0]) return null;
  if (isWeb) return webImageDataUri(res.assets[0].uri, kind === 'logo' ? 400 : 600, 'image/png');
  return keep(res.assets[0].uri, kind);
}

/** Never throws — a missing file is the state we were after anyway. */
export function deleteBrandImage(uri: string | null | undefined): void {
  if (!uri || !uri.includes(FOLDER)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to do.
  }
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * An image as a data: uri, for embedding in a printed document.
 *
 * The print view renders HTML in its own sandbox and will not reliably load a
 * file:// path, so the bytes travel inside the page. Returns null for anything
 * missing or unreadable — a bill without a logo still has to print.
 */
export async function imageDataUri(uri: string | null | undefined): Promise<string | null> {
  if (!uri) return null;
  // Already inline — how the web build stores a picked image.
  if (uri.startsWith('data:')) return uri;
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    const type = MIME[(file.extension || '').toLowerCase()] ?? 'image/png';
    return `data:${type};base64,${await file.base64()}`;
  } catch {
    return null;
  }
}
