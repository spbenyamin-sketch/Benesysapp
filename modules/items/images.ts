// Item photos. The counter screen is meant to be usable by someone who cannot
// read the item names, so a picture is a first-class part of an item.
//
// The picker hands back a file in the OS cache, which Android is free to wipe.
// So every picked photo is copied into the app's own document directory and
// only THAT uri is stored in the DB.

import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { webImageDataUri } from '@/modules/settings/brandImages';
import { isWeb } from '@/utils/webFile';

const FOLDER = 'item-images';

function imagesDir(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copy a just-picked photo into permanent storage and return its uri. */
function keep(sourceUri: string): string {
  const src = new File(sourceUri);
  const ext = src.extension || '.jpg';
  // Name by content-free counter: the DB row may not exist yet (new item).
  const name = `item-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`;
  const target = new File(imagesDir(), name);
  src.copy(target);
  return target.uri;
}

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.6, // a tile is ~160px wide; full resolution would just bloat backups
};

/**
 * Take a photo with the camera. Returns the stored uri, or null if the user
 * backed out. Throws with a readable message when permission is refused.
 */
export async function captureItemPhoto(): Promise<string | null> {
  // A browser's file input is the camera too, on a phone; on a desktop it is
  // the only way in. Either way it is the picker.
  if (isWeb) return pickItemPhoto();
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is needed to take a photo.');
  const res = await ImagePicker.launchCameraAsync(OPTIONS);
  if (res.canceled || !res.assets?.[0]) return null;
  return keep(res.assets[0].uri);
}

/** Pick an existing photo from the gallery. Same contract as capture. */
export async function pickItemPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo permission is needed to choose a picture.');
  const res = await ImagePicker.launchImageLibraryAsync(OPTIONS);
  if (res.canceled || !res.assets?.[0]) return null;
  // No document directory to copy into on web; a tile-sized inline image instead.
  if (isWeb) return webImageDataUri(res.assets[0].uri, 320, 'image/jpeg');
  return keep(res.assets[0].uri);
}

/**
 * Delete a stored photo. Only ever touches our own folder, and never throws —
 * a missing file is exactly the state we wanted anyway.
 */
export function deleteItemPhoto(uri: string | null | undefined): void {
  if (!uri || !uri.includes(FOLDER)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to do — the photo is gone either way.
  }
}
