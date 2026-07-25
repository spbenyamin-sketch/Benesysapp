// Where automatic backups go, besides the phone itself.
//
// Approach: the user picks a folder ONCE with Android's own folder picker, and
// every scheduled backup is copied there. If they pick a folder that the Google
// Drive (or OneDrive) app already syncs, the backup lands in the cloud with no
// OAuth, no API keys, no Google Cloud project and no account for us to hold.
// Android persists the write permission, so it survives app restarts.

import { Directory, File } from 'expo-file-system';
import { getSetting, setSetting, deleteSetting } from '@/modules/settings/service';

export const FOLDER_KEY = 'backup_folder_uri';

export async function getBackupFolder(): Promise<string | null> {
  return (await getSetting(FOLDER_KEY)) ?? null;
}

/** A short, readable version of a content:// tree uri for the settings screen. */
export function folderLabel(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const tail = decoded.split(':').pop() ?? decoded;
    return tail || decoded;
  } catch {
    return uri;
  }
}

/** Opens the system folder picker and remembers the choice. */
export async function pickBackupFolder(): Promise<string> {
  const dir = await Directory.pickDirectoryAsync();
  await setSetting(FOLDER_KEY, dir.uri);
  return dir.uri;
}

export async function clearBackupFolder(): Promise<void> {
  await deleteSetting(FOLDER_KEY);
}

/**
 * The `Uploader` handed to the backup scheduler: copy the snapshot into the
 * chosen folder. Returns null when no folder is set, so a phone-only setup is
 * reported as a success rather than a failure.
 */
export async function copyToChosenFolder(file: File, _nowIso: string): Promise<string | null> {
  const uri = await getBackupFolder();
  if (!uri) return null;

  const dir = new Directory(uri);
  if (!dir.exists) {
    throw new Error('Backup folder is gone — pick it again in Settings.');
  }

  const target = dir.createFile(file.name, 'application/json');
  target.write(await file.text());
  return `Copied to ${folderLabel(uri)}`;
}
