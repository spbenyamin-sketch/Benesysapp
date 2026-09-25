// Licence state: what is stored, and what the gate is allowed to conclude from it.
//
// Everything lives in SecureStore (Android Keystore), never in SQLite — the same
// reasoning as the account in modules/auth/service.ts. `restoreBackup()` wipes
// and reloads every table, so a licence kept in the DB would be replaced by
// whatever was in someone else's backup file.

import { sql } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';
import { db } from '@/db/client';
import { daysBetween, todayISO } from './dates';
import { getSystemId } from './device';
import { verifyLicense, type LicenseFile } from './licenseFile';
import { TRIAL_DAYS, WARN_DAYS, evaluateTrial, isUsable, type LicenseState, type LicenseStatus } from './status';

const K_LICENSE = 'license.file';
const K_LAST_RUN = 'license.lastRun';
// Written once, on the first launch that finds no licence, and never cleared —
// not even by clearLicense() — so a lapsed trial cannot be restarted from inside
// the app.
const K_TRIAL_START = 'license.trialStart';

// The states, the warning threshold and "may it open" now live in ./status, so
// Online mode's server-side licence cannot drift away from the phone's. Kept
// exported from here because the screens have always imported them from here.
export { TRIAL_DAYS, WARN_DAYS, isUsable };
export type { LicenseState, LicenseStatus };

/**
 * Read the licence and decide where the app stands today.
 *
 * The stored file is re-verified on every launch rather than trusted: that is
 * what makes copying the app's storage onto a second phone useless, since the
 * signature covers the System ID it was issued for.
 */
export async function checkLicense(): Promise<LicenseStatus> {
  const systemId = await getSystemId();
  const [stored, lastRun] = await Promise.all([
    SecureStore.getItemAsync(K_LICENSE),
    SecureStore.getItemAsync(K_LAST_RUN),
  ]);

  if (!stored) return trial(systemId, lastRun);

  const check = verifyLicense(stored, systemId);
  if (!check.valid || !check.license) {
    // Either the phone changed or the stored file was edited. Treat it as never
    // having been activated — the client can import a licence for this device.
    return trial(systemId, lastRun);
  }

  const { expiry, client } = check.license;
  const today = todayISO();

  // Winding the clock back is the cheapest way to stretch an offline licence,
  // so a date earlier than the last run is refused outright. The VFP build does
  // the same with LastRunDate.
  if (lastRun && today < lastRun) {
    return { state: 'rolledBack', systemId, expiry, client, daysLeft: daysBetween(today, expiry) };
  }

  await SecureStore.setItemAsync(K_LAST_RUN, today);

  const daysLeft = daysBetween(today, expiry);
  if (daysLeft < 0) return { state: 'expired', systemId, expiry, client, daysLeft };
  return {
    state: daysLeft <= WARN_DAYS ? 'expiring' : 'active',
    systemId,
    expiry,
    client,
    daysLeft,
  };
}

/**
 * No licence yet: the app runs free for TRIAL_DAYS from its first launch, then
 * asks for one. The clock-rollback rule applies here as it does to a licence.
 */
async function trial(systemId: string, lastRun: string | null): Promise<LicenseStatus> {
  const today = todayISO();
  const stored = await SecureStore.getItemAsync(K_TRIAL_START);
  // A reinstall wipes the Keystore, so the stamp alone would hand out a fresh
  // week to anyone who backs up, reinstalls and restores. The shop's own rows
  // keep the day they were really created, so the trial starts no later than
  // the oldest of them.
  const oldest = oldestRecordDay();
  let start = stored ?? today;
  if (oldest && oldest < start) start = oldest;
  if (start !== stored) await SecureStore.setItemAsync(K_TRIAL_START, start);

  const status = evaluateTrial(systemId, start, today);
  if (status.state !== 'rolledBack' && lastRun && today < lastRun) {
    return { ...status, state: 'rolledBack' };
  }
  if (status.state !== 'rolledBack') await SecureStore.setItemAsync(K_LAST_RUN, today);
  return status;
}

/**
 * The local day the oldest shop record was created, or null on an empty shop.
 * created_at is the database's own insert stamp — a restore keeps it, and no
 * screen lets anyone type it — so it is the one date a backup cannot shed.
 */
function oldestRecordDay(): string | null {
  try {
    const row = db.get<{ first: string | null }>(sql`
      select min(first) as first from (
        select min(created_at) as first from parties
        union all select min(created_at) from items
        union all select min(created_at) from invoices
        union all select min(created_at) from payments
        union all select min(created_at) from expenses
      )`);
    if (!row?.first) return null;
    const when = new Date(row.first);
    return Number.isNaN(when.getTime()) ? null : todayISO(when);
  } catch {
    // An unreadable database says nothing about the trial either way.
    return null;
  }
}

export interface ActivationResult {
  ok: boolean;
  license?: LicenseFile;
  reason?: string;
}

/**
 * Take the contents of a .lic file the client just picked.
 *
 * A licence whose date has already passed is rejected here rather than stored —
 * otherwise the import "succeeds" and the app locks itself on the next screen.
 */
export async function activateFromFile(text: string): Promise<ActivationResult> {
  const systemId = await getSystemId();
  const check = verifyLicense(text, systemId);
  if (!check.valid || !check.license) {
    return { ok: false, reason: check.reason ?? 'That licence is not valid for this phone.' };
  }

  const today = todayISO();
  if (daysBetween(today, check.license.expiry) < 0) {
    return { ok: false, reason: `That licence expired on ${check.license.expiry}.` };
  }

  await Promise.all([
    // Store what was verified, not the raw text — a re-serialised object cannot
    // smuggle in extra fields alongside a signature that never covered them.
    SecureStore.setItemAsync(K_LICENSE, JSON.stringify(check.license)),
    SecureStore.setItemAsync(K_LAST_RUN, today),
  ]);

  return { ok: true, license: check.license };
}

/** Forget the licence — used by the vendor when moving a client to a new phone. */
export async function clearLicense(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(K_LICENSE),
    SecureStore.deleteItemAsync(K_LAST_RUN),
  ]);
}
