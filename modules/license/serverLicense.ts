// Online mode's licence: the same signed `.lic` file, bound to the shop's SERVER
// instead of to one phone.
//
// WHY THE SERVER NEEDS ITS OWN IDENTITY
// A browser has nothing a licence can be tied to — clear the site data, or open
// the app from a second laptop on the shop's network, and any per-browser lock
// is gone. What is actually being sold in Online mode is the server: one
// install, on the shop's computer, holding the shop's books. So that is what the
// licence names.
//
// WHY A SEED IN THE CONTROL DATABASE
// The identity has to survive the two things that do happen: restarting the
// server, and replacing the app's folder with a newer build (which start-web.bat
// does on every update). Anything kept next to the code — a file, a line in
// .env — dies with the second of those. Postgres is installed separately and the
// `benesys_billing` database outlives both, so the anchor is a random seed
// written once into the control schema, hashed before it is shown. That also
// means a legitimate restore of the shop's own database backup brings the
// licence back with it, which a hardware or install fingerprint would not.
//
// The honest trade, the same one LICENSE-SETUP.md already admits for the phone:
// a shop that copies its whole database onto a second machine copies the licence
// too. There is no offline way to revoke that. Short expiry periods are the
// practical answer.
//
// Pure, and platform-free: the server imports it, and the tests run it in plain
// Node. The app bundle never reaches it.

import { sha256 } from '@noble/hashes/sha2.js';
import { daysBetween, groupFour, todayISO } from './dates';
import { verifyLicense, type LicenseFile } from './licenseFile';
import { WARN_DAYS, type LicenseStatus } from './status';

/**
 * Server IDs wear a prefix so the vendor can tell at a glance which kind of
 * install is asking — `tools/issued/` is their only record of who has what, and
 * "SRV9F3C…-2027-08-10.lic" answers the question the filename otherwise raises.
 * It also keeps the two ID namespaces provably apart: a phone's licence can
 * never be mistaken for this server's, whatever the hash happens to produce.
 */
export const SERVER_ID_PREFIX = 'SRV';
const ID_HEX_LEN = 16;

/** What is stored for this install: its seed, its licence, and when it last ran. */
export interface ServerLicenseRow {
  seed: string;
  /** The verified licence as JSON, or null while the install is unlicensed. */
  license: string | null;
  /** ISO date of the last check, for the clock-rollback rule. */
  lastSeen: string | null;
}

/** Test/verification seam — the real key is the one compiled into the app. */
interface Options {
  today?: string;
  publicKeyHex?: string;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** "SRV-9F3C-11AB-7E20-04D5" — stable for as long as the shop's database is. */
export function serverSystemId(seed: string): string {
  const digest = hex(sha256(new TextEncoder().encode(`server:${seed}`)));
  return `${SERVER_ID_PREFIX}-${groupFour(digest.slice(0, ID_HEX_LEN).toUpperCase())}`;
}

/**
 * Where this install stands today.
 *
 * The stored licence is re-verified on every check rather than trusted, exactly
 * as the phone does it: the signature covers the System ID, so a licence row
 * lifted from another shop's database is refused here, seed and all.
 */
export function evaluateServerLicense(row: ServerLicenseRow, options: Options = {}): LicenseStatus {
  const systemId = serverSystemId(row.seed);
  const today = options.today ?? todayISO();

  if (!row.license) return { state: 'unlicensed', systemId };

  const check = verifyLicense(row.license, systemId, options.publicKeyHex, 'server');
  if (!check.valid || !check.license) return { state: 'unlicensed', systemId };

  const { expiry, client } = check.license;
  const daysLeft = daysBetween(today, expiry);

  // Winding the shop computer's clock back is the cheapest way to stretch a
  // licence that is checked offline, so a date earlier than the last check is
  // refused outright — the phone's rule, on the machine that now holds it.
  if (row.lastSeen && today < row.lastSeen) {
    return { state: 'rolledBack', systemId, expiry, client, daysLeft };
  }

  if (daysLeft < 0) return { state: 'expired', systemId, expiry, client, daysLeft };
  return { state: daysLeft <= WARN_DAYS ? 'expiring' : 'active', systemId, expiry, client, daysLeft };
}

export interface ServerActivation {
  ok: boolean;
  license?: LicenseFile;
  reason?: string;
}

/**
 * Take the `.lic` text the owner pasted.
 *
 * A licence whose date has already passed is refused here rather than stored —
 * otherwise the install "succeeds" and the very next screen locks the shop out.
 */
export function acceptServerLicense(
  seed: string,
  text: string,
  options: Options = {},
): ServerActivation {
  const systemId = serverSystemId(seed);
  const check = verifyLicense(text, systemId, options.publicKeyHex, 'server');
  if (!check.valid || !check.license) {
    return { ok: false, reason: check.reason ?? 'That licence is not valid for this server.' };
  }

  const today = options.today ?? todayISO();
  if (daysBetween(today, check.license.expiry) < 0) {
    return { ok: false, reason: `That licence expired on ${check.license.expiry}.` };
  }
  return { ok: true, license: check.license };
}
