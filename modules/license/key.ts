// Offline device-locked licence keys — the same idea as the VFP HWLock the
// desktop product uses (System ID + expiry date + vendor secret → one key that
// only works on that machine, until that date), with two changes:
//
//  1. SHA-256 instead of CRC. SYS(2007) is a 16-bit checksum: with ~65k possible
//     values a wrong key would be accepted by accident roughly once in 65,000
//     tries, which a person with an evening to spare can beat by hand.
//  2. The expiry travels INSIDE the key. The VFP version has to try every date
//     for ten years to work out which one a key means; here the first block is
//     the day number, masked so it still isn't readable, and verification is a
//     single hash.
//
// This file is pure — the hash function is passed in — so the app can use
// expo-crypto, the tests can use Node's crypto, and tools/keygen.html can use
// the browser's WebCrypto while all three produce identical keys.

import { LICENSE_SECRET } from './secret';

/** Day 0. Expiry dates are stored as days since this, in 16 bits (~179 years). */
const EPOCH_UTC = Date.UTC(2020, 0, 1);
const DAY_MS = 86400000;
const MAX_DAY = 0xffff;

/** 20 hex chars: 4 of masked day number + 16 of hash. Shown as 5 groups of 4. */
const KEY_HEX_LEN = 20;
const DAY_HEX_LEN = 4;

export type Sha256Hex = (input: string) => Promise<string>;

export interface KeyCheck {
  valid: boolean;
  /** ISO 'YYYY-MM-DD' the key expires on — only set when valid. */
  expiry?: string;
  /** Why it failed, for the activation screen. */
  reason?: string;
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** ISO 'YYYY-MM-DD' → days since the epoch. NaN for anything unparseable. */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return NaN;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  // Date.UTC happily rolls 2026-02-31 over into March; reject that.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) {
    return NaN;
  }
  return Math.round((ms - EPOCH_UTC) / DAY_MS);
}

/** Days since the epoch → ISO 'YYYY-MM-DD'. */
export function dateFromDayNumber(day: number): string {
  return new Date(EPOCH_UTC + day * DAY_MS).toISOString().slice(0, 10);
}

/** Today in the phone's own timezone, as ISO 'YYYY-MM-DD'. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to` (negative once `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

// ── Key text ─────────────────────────────────────────────────────────────────

/**
 * Strip anything a person might add while typing or reading a key aloud —
 * dashes, spaces, case — and confirm what is left is 20 hex characters.
 * Hex is deliberate: it has no letter that can be confused with a digit.
 */
export function normalizeKey(input: string): string | null {
  const cleaned = (input ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return cleaned.length === KEY_HEX_LEN ? cleaned : null;
}

/** 20 hex chars → "A1B2-C3D4-E5F6-0718-293A" for reading out over the phone. */
export function formatKey(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

// ── Generate / verify ────────────────────────────────────────────────────────

/**
 * The 16-bit mask that hides the day number. Derived from the System ID, so the
 * same expiry date produces a different-looking key on every device.
 */
async function maskFor(systemId: string, sha256: Sha256Hex): Promise<number> {
  const digest = await sha256(`${systemId}|${LICENSE_SECRET}|mask`);
  return parseInt(digest.slice(0, 4), 16);
}

async function signatureFor(
  systemId: string,
  expiry: string,
  sha256: Sha256Hex,
): Promise<string> {
  const digest = await sha256(`${systemId}|${expiry}|${LICENSE_SECRET}`);
  return digest.slice(0, KEY_HEX_LEN - DAY_HEX_LEN).toUpperCase();
}

/** Mint a key. Both arguments come straight from the vendor's keygen form. */
export async function generateKey(
  systemId: string,
  expiry: string,
  sha256: Sha256Hex,
): Promise<string> {
  const id = systemId.trim().toUpperCase();
  if (!id) throw new Error('System ID is required.');

  const day = dayNumber(expiry);
  if (!Number.isFinite(day)) throw new Error('Expiry must be a real date in YYYY-MM-DD form.');
  if (day < 0 || day > MAX_DAY) throw new Error('Expiry is outside the supported range.');

  const mask = await maskFor(id, sha256);
  const masked = (day ^ mask) & 0xffff;
  const head = masked.toString(16).toUpperCase().padStart(DAY_HEX_LEN, '0');

  return formatKey(head + (await signatureFor(id, dateFromDayNumber(day), sha256)));
}

/**
 * Check a key against this device and read its expiry back out. A key minted
 * for another System ID fails here — that is the whole device lock.
 */
export async function verifyKey(
  systemId: string,
  key: string,
  sha256: Sha256Hex,
): Promise<KeyCheck> {
  const raw = normalizeKey(key);
  if (!raw) return { valid: false, reason: 'That key is not 20 characters long.' };

  const id = systemId.trim().toUpperCase();
  const mask = await maskFor(id, sha256);
  const day = (parseInt(raw.slice(0, DAY_HEX_LEN), 16) ^ mask) & 0xffff;
  const expiry = dateFromDayNumber(day);

  const expected = await signatureFor(id, expiry, sha256);
  if (expected !== raw.slice(DAY_HEX_LEN)) {
    return { valid: false, reason: 'This key does not belong to this device.' };
  }

  return { valid: true, expiry };
}
