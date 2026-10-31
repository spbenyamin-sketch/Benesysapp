// The shop's books, copied out of Postgres once a day.
//
// Online mode keeps every bill in one database on one computer. A dead disk, a
// Windows reinstall or a mistyped command would take the lot, so this server
// takes a pg_dump of its own database every day it is switched on, keeps the
// last month of them in a folder, and drops the oldest. restore-backup.bat
// (src/tools/restore-backup.ts) puts one back.
//
// The folder is outside the app folder on purpose: replacing the app with a new
// version must never take the backups with it. Point BACKUP_DIR at a OneDrive or
// Google Drive folder, or a pendrive, and they leave the computer as well.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HOUR_MS = 60 * 60 * 1000;
/** A day, less an hour — so a computer switched on at the same time each morning still gets one. */
const EVERY_MS = 23 * HOUR_MS;
const DEFAULT_KEEP = 30;

/** Daily backups are named this, then the date and time. Nothing else is ever pruned. */
const DAILY = 'benesys_billing-';
const DAILY_NAME = /^benesys_billing-\d{4}-\d{2}-\d{2}_\d{4}\.dump$/;

export function backupDir(): string {
  return process.env.BACKUP_DIR?.trim() || path.join(os.homedir(), 'Documents', 'Benesys Billing Backups');
}

const keepCount = () => {
  const n = Number(process.env.BACKUP_KEEP);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_KEEP;
};

/**
 * pg_dump or pg_restore. The newest PostgreSQL install first — a dump has to be
 * taken by a pg_dump at least as new as the server — then whatever is on PATH.
 */
export function pgTool(name: 'pg_dump' | 'pg_restore'): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, exe);
  if (process.platform === 'win32') {
    for (let v = 20; v >= 13; v--) {
      const p = path.join('C:\\Program Files\\PostgreSQL', String(v), 'bin', exe);
      if (existsSync(p)) return p;
    }
  }
  return name;
}

/**
 * The connection as libpq environment variables rather than a URL on the command
 * line, where the password would be readable in the process list.
 */
export function pgEnv(): NodeJS.ProcessEnv {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set.');
  const url = new URL(raw);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

/** Run a PostgreSQL tool; resolves on exit 0, otherwise rejects with what it printed. */
export function runPgTool(name: 'pg_dump' | 'pg_restore', args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pgTool(name), args, { env: pgEnv(), windowsHide: true });
    let errText = '';
    child.stderr.on('data', (d) => (errText += d));
    child.on('error', (e) =>
      reject(new Error(`${name} could not be started (${e.message}). Is PostgreSQL installed on this computer?`)),
    );
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(errText.trim() || `${name} stopped with code ${code}.`)),
    );
  });
}

export interface BackupFile {
  file: string;
  path: string;
  at: string;
  size: number;
}

/** Every backup in the folder, newest first — the daily ones and any taken before a restore. */
export async function listBackups(): Promise<BackupFile[]> {
  const dir = backupDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(
    names
      .filter((n) => n.endsWith('.dump'))
      .map(async (n) => {
        const s = await stat(path.join(dir, n));
        return { file: n, path: path.join(dir, n), at: s.mtime.toISOString(), size: s.size };
      }),
  );
  return files.sort((a, b) => b.at.localeCompare(a.at));
}

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * One backup now. Written under a temporary name and renamed when pg_dump has
 * finished, so a dump cut off halfway never sits in the folder looking like a
 * good one. `label` names a one-off (the copy taken before a restore), which
 * the daily pruning leaves alone.
 */
export async function takeBackup(label?: string): Promise<BackupFile> {
  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  const name = `${DAILY}${label ? `${label}-` : ''}${stamp(new Date())}.dump`;
  const final = path.join(dir, name);
  const partial = `${final}.partial`;
  try {
    await runPgTool('pg_dump', ['--format=custom', '--no-owner', '--file', partial]);
    await rename(partial, final);
  } finally {
    await rm(partial, { force: true });
  }
  if (!label) await prune();
  const s = await stat(final);
  return { file: name, path: final, at: s.mtime.toISOString(), size: s.size };
}

/** Keep the newest daily backups, drop the rest. Only ever touches files this code named. */
async function prune() {
  const daily = (await listBackups()).filter((b) => DAILY_NAME.test(b.file));
  for (const old of daily.slice(keepCount())) await rm(old.path, { force: true });
}

// ── The daily schedule ───────────────────────────────────────────────────────

let running: Promise<BackupFile> | null = null;
let lastError: { at: string; message: string } | null = null;

/** One at a time: a "Back up now" pressed during the daily run waits for that run. */
export function backupNow(label?: string): Promise<BackupFile> {
  if (running && !label) return running;
  const run = takeBackup(label)
    .then((b) => {
      lastError = null;
      console.log(`Backup saved: ${b.path} (${Math.round(b.size / 1024)} KB)`);
      return b;
    })
    .catch((e: Error) => {
      lastError = { at: new Date().toISOString(), message: e.message };
      console.error(`Backup FAILED: ${e.message}`);
      throw e;
    })
    .finally(() => {
      if (running === run) running = null;
    });
  if (!label) running = run;
  return run;
}

export async function backupStatus() {
  const latest = (await listBackups())[0] ?? null;
  return { dir: backupDir(), latest, error: lastError };
}

async function backupIfDue() {
  const latest = (await listBackups()).find((b) => DAILY_NAME.test(b.file));
  if (latest && Date.now() - Date.parse(latest.at) < EVERY_MS) return;
  await backupNow().catch(() => {}); // already logged, and shown in Settings
}

/**
 * Check once a couple of minutes after start, then every hour. Daily by the age
 * of the newest backup rather than by the clock: a shop computer is off at
 * night, and a 2 a.m. job on it would simply never run.
 */
export function startDailyBackups() {
  if (process.env.BACKUP_DISABLED === '1') return;
  setTimeout(() => void backupIfDue(), 2 * 60 * 1000).unref();
  setInterval(() => void backupIfDue(), HOUR_MS).unref();
}
