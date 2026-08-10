// Licence state: what is stored, and what the gate is allowed to conclude from it.
//
// Everything lives in SecureStore (Android Keystore), never in SQLite — the same
// reasoning as the account in modules/auth/service.ts. `restoreBackup()` wipes
// and reloads every table, so a licence kept in the DB would be replaced by
// whatever was in someone else's backup file.

import * as SecureStore from 'expo-secure-store';
import { daysBetween, todayISO } from './dates';
import { getSystemId } from './device';
import { verifyLicense, type LicenseFile } from './licenseFile';

const K_LICENSE = 'license.file';
const K_LAST_RUN = 'license.lastRun';

/** Warn the shop this many days out, so a renewal can be arranged in time. */
export const WARN_DAYS = 7;

export type LicenseState = 'unlicensed' | 'active' | 'expiring' | 'expired' | 'rolledBack';

export interface LicenseStatus {
  state: LicenseState;
  systemId: string;
  expiry?: string;
  /** Negative once the date has passed. */
  daysLeft?: number;
  /** Shop name the licence was issued to, when there is one. */
  client?: string;
}

export function isUsable(status: LicenseStatus): boolean {
  return status.state === 'active' || status.state === 'expiring';
}

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

  if (!stored) return { state: 'unlicensed', systemId };

  const check = verifyLicense(stored, systemId);
  if (!check.valid || !check.license) {
    // Either the phone changed or the stored file was edited. Treat it as never
    // having been activated — the client can import a licence for this device.
    return { state: 'unlicensed', systemId };
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
