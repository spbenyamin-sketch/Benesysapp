// Automatic backup scheduling.
//
// The user picks HOW MANY TIMES A DAY it should run (1–24) rather than a raw
// interval — that's the way a shopkeeper actually thinks about it, and it keeps
// the setting to a single tap.
//
// Scheduling reality on Android: a JS timer only runs while the app is alive,
// and OS background jobs are throttled to ~15 minutes minimum. So instead of
// promising background work we can't deliver, this checks "is a backup due?"
// every time the app is opened or brought to the foreground, plus on a timer
// while it stays open. A shop phone is opened many times a day, so in practice
// the chosen cadence is met.

import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { buildBackup } from '@/modules/backup/service';
import { getSetting, setSetting } from '@/modules/settings/service';

export const AUTO_KEY = 'backup_auto';
export const PER_DAY_KEY = 'backup_per_day';
export const LAST_AT_KEY = 'backup_last_at';
export const LAST_RESULT_KEY = 'backup_last_result';
export const ON_EXIT_KEY = 'backup_on_exit';

/** Offered cadences. Anything finer than hourly is pointless for a shop's data. */
export const PER_DAY_CHOICES = [1, 2, 4, 6, 12, 24] as const;
export type PerDay = (typeof PER_DAY_CHOICES)[number];

export const PER_DAY_LABEL: Record<PerDay, string> = {
  1: 'Once a day',
  2: 'Twice a day (12 hrs)',
  4: '4 times a day (6 hrs)',
  6: '6 times a day (4 hrs)',
  12: '12 times a day (2 hrs)',
  24: 'Every hour',
};

const DEFAULT_PER_DAY: PerDay = 4;
/** How many snapshot files to keep on the phone before the oldest is dropped. */
const KEEP = 10;
const DIR_NAME = 'backups';

export interface AutoBackupConfig {
  enabled: boolean;
  perDay: PerDay;
  lastAt: string | null; // ISO
  lastResult: string | null;
  onExit: boolean;
}

export async function getAutoBackupConfig(): Promise<AutoBackupConfig> {
  const [auto, perDay, lastAt, lastResult, onExit] = await Promise.all([
    getSetting(AUTO_KEY),
    getSetting(PER_DAY_KEY),
    getSetting(LAST_AT_KEY),
    getSetting(LAST_RESULT_KEY),
    getSetting(ON_EXIT_KEY),
  ]);
  const n = Number(perDay);
  return {
    // Defaults ON: every run also uploads to Drive once an account is
    // connected, and a shop that never opened Settings should still have one.
    enabled: auto !== '0',
    perDay: (PER_DAY_CHOICES as readonly number[]).includes(n) ? (n as PerDay) : DEFAULT_PER_DAY,
    lastAt: lastAt ?? null,
    lastResult: lastResult ?? null,
    // Defaults ON, unlike the scheduled backup: closing the app is the one
    // moment the user is definitely present to answer, and a day's billing lost
    // to a phone that never got reopened is the failure this exists to prevent.
    onExit: onExit !== '0',
  };
}

export async function setAutoBackupEnabled(on: boolean): Promise<void> {
  await setSetting(AUTO_KEY, on ? '1' : '0');
}

export async function setBackupOnExit(on: boolean): Promise<void> {
  await setSetting(ON_EXIT_KEY, on ? '1' : '0');
}

export async function setBackupsPerDay(perDay: PerDay): Promise<void> {
  await setSetting(PER_DAY_KEY, String(perDay));
}

/** Gap between runs, in ms, for the chosen cadence. */
export function intervalMs(perDay: PerDay): number {
  return Math.round(86_400_000 / perDay);
}

export function isDue(config: AutoBackupConfig, nowMs: number): boolean {
  if (!config.enabled) return false;
  if (!config.lastAt) return true; // never run — do one now
  const last = Date.parse(config.lastAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= intervalMs(config.perDay);
}

// ── Local snapshots ──────────────────────────────────────────────────────────

function backupDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Newest first. */
export function listSnapshots(): File[] {
  const dir = backupDir();
  return dir
    .list()
    .filter((e): e is File => e instanceof File && e.name.endsWith('.json'))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function pruneSnapshots(): void {
  const files = listSnapshots();
  for (const f of files.slice(KEEP)) {
    try {
      f.delete();
    } catch {
      /* a file we can't remove shouldn't fail the backup */
    }
  }
}

/**
 * Write a full JSON snapshot into the app's document storage. Silent, offline,
 * and instant — this always happens, whether or not a cloud destination is set
 * up, so there is never a moment with no backup at all.
 */
export async function writeSnapshot(nowIso: string): Promise<File> {
  const backup = await buildBackup(nowIso);
  const name = `billing-backup-${nowIso.replace(/[:.]/g, '-')}.json`;
  const file = new File(backupDir(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  pruneSnapshots();
  return file;
}

/**
 * Whether an upload has any chance of working. Nothing calls this on the way in
 * — a Drive upload that fails offline is caught and reported per destination —
 * but it's what any future "wait for a network" retry would be built on.
 */
export async function hasInternet(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    return false;
  }
}

export interface BackupRunResult {
  ran: boolean;
  snapshot?: string; // file uri
  uploaded: boolean;
  message: string;
}

/**
 * Copies the snapshot somewhere off the phone. Injected by the caller so this
 * module stays independent of the destination (Google Drive today). Returns a
 * short human message on success, `null` when no destination is configured, or
 * throws to report a real failure.
 */
export type Uploader = (file: File, nowIso: string) => Promise<string | null>;

/**
 * Run a backup now, regardless of schedule. Every uploader is tried and each
 * one's outcome shows up in the result line, so one failing destination never
 * hides another that worked.
 */
export async function runBackupNow(
  nowIso: string,
  upload?: Uploader | Uploader[],
): Promise<BackupRunResult> {
  const file = await writeSnapshot(nowIso);
  const uploaders = !upload ? [] : Array.isArray(upload) ? upload : [upload];
  const parts: string[] = [];
  let uploaded = false;

  for (const up of uploaders) {
    try {
      const result = await up(file, nowIso);
      if (result) {
        parts.push(result);
        uploaded = true;
      }
    } catch (e) {
      // The phone copy already succeeded — a failed off-device copy must not
      // make the whole backup look like it failed.
      parts.push(`failed: ${(e as Error)?.message ?? String(e)}`);
    }
  }

  const message = ['Saved on phone', ...parts].join(' · ');
  await Promise.all([setSetting(LAST_AT_KEY, nowIso), setSetting(LAST_RESULT_KEY, message)]);
  return { ran: true, snapshot: file.uri, uploaded, message };
}

/** Run only if the chosen cadence says it's time. Safe to call often. */
export async function runBackupIfDue(
  nowIso: string,
  upload?: Uploader | Uploader[],
): Promise<BackupRunResult> {
  const config = await getAutoBackupConfig();
  if (!isDue(config, Date.parse(nowIso))) {
    return { ran: false, uploaded: false, message: 'Not due yet' };
  }
  return runBackupNow(nowIso, upload);
}
