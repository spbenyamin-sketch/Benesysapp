// Licence state: what is stored, and what the gate is allowed to conclude from it.
//
// Everything lives in SecureStore (Android Keystore), never in SQLite — the same
// reasoning as the account in modules/auth/service.ts. `restoreBackup()` wipes
// and reloads every table, so a licence kept in the DB would be replaced by
// whatever was in someone else's backup file.

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { getSystemId } from './device';
import { daysBetween, todayISO, verifyKey, type Sha256Hex } from './key';

const K_KEY = 'license.key';
const K_EXPIRY = 'license.expiry';
const K_LAST_RUN = 'license.lastRun';

/** Warn the shop this many days out, so a renewal can be arranged in time. */
export const WARN_DAYS = 7;

const sha256: Sha256Hex = (input) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);

export type LicenseState = 'unlicensed' | 'active' | 'expiring' | 'expired' | 'rolledBack';

export interface LicenseStatus {
  state: LicenseState;
  systemId: string;
  /** ISO 'YYYY-MM-DD'. Absent while unlicensed. */
  expiry?: string;
  /** Negative once the date has passed. */
  daysLeft?: number;
}

export function isUsable(status: LicenseStatus): boolean {
  return status.state === 'active' || status.state === 'expiring';
}

/**
 * Read the licence and decide where the app stands today.
 *
 * The stored key is re-verified on every launch rather than trusted: that is
 * what makes copying the app's storage to a second phone useless, since the
 * key only validates against the System ID it was minted for.
 */
export async function checkLicense(): Promise<LicenseStatus> {
  const systemId = await getSystemId();
  const [key, expiry, lastRun] = await Promise.all([
    SecureStore.getItemAsync(K_KEY),
    SecureStore.getItemAsync(K_EXPIRY),
    SecureStore.getItemAsync(K_LAST_RUN),
  ]);

  if (!key || !expiry) return { state: 'unlicensed', systemId };

  const check = await verifyKey(systemId, key, sha256);
  if (!check.valid || check.expiry !== expiry) {
    // Either the phone changed or the stored pair was edited. Treat it as never
    // having been activated — the client can re-enter a key for this device.
    return { state: 'unlicensed', systemId };
  }

  const today = todayISO();

  // Winding the clock back is the cheapest way to extend an offline licence,
  // so a date earlier than the last run is refused outright. The VFP build
  // does the same with LastRunDate.
  if (lastRun && today < lastRun) {
    return { state: 'rolledBack', systemId, expiry, daysLeft: daysBetween(today, expiry) };
  }

  await SecureStore.setItemAsync(K_LAST_RUN, today);

  const daysLeft = daysBetween(today, expiry);
  if (daysLeft < 0) return { state: 'expired', systemId, expiry, daysLeft };
  return {
    state: daysLeft <= WARN_DAYS ? 'expiring' : 'active',
    systemId,
    expiry,
    daysLeft,
  };
}

export interface ActivationResult {
  ok: boolean;
  expiry?: string;
  reason?: string;
}

/**
 * Accept a key typed on the activation screen. A key whose date has already
 * passed is rejected here rather than stored — otherwise activation "succeeds"
 * and the app locks itself on the very next screen.
 */
export async function activate(input: string): Promise<ActivationResult> {
  const systemId = await getSystemId();
  const check = await verifyKey(systemId, input, sha256);
  if (!check.valid || !check.expiry) {
    return { ok: false, reason: check.reason ?? 'That key is not valid for this device.' };
  }

  const today = todayISO();
  if (daysBetween(today, check.expiry) < 0) {
    return { ok: false, reason: `That key expired on ${check.expiry}.` };
  }

  await Promise.all([
    SecureStore.setItemAsync(K_KEY, input.toUpperCase().replace(/[^0-9A-F]/g, '')),
    SecureStore.setItemAsync(K_EXPIRY, check.expiry),
    SecureStore.setItemAsync(K_LAST_RUN, today),
  ]);

  return { ok: true, expiry: check.expiry };
}

/** Forget the licence — used by the vendor when moving a client to a new phone. */
export async function clearLicense(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(K_KEY),
    SecureStore.deleteItemAsync(K_EXPIRY),
    SecureStore.deleteItemAsync(K_LAST_RUN),
  ]);
}
