// This installation's licence, kept in the control database.
//
// It sits next to the sign-in code because it answers the same kind of question
// one level up: not "may this person use the shop" but "may this server be used
// at all". The rules themselves — how the Server ID is derived, what counts as
// expired, the clock-rollback check — are shared with the phone in
// modules/license/serverLicense.ts, so there is one licence format and one key.

import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { todayISO } from '@/modules/license/dates';
import { acceptServerLicense, evaluateServerLicense } from '@/modules/license/serverLicense';
import type { LicenseStatus } from '@/modules/license/status';
import { control } from '../db/client';
import { serverLicense } from '../db/control-schema';
import { badRequest } from '../http/errors';

/** The one row. See control-schema.ts for why there is exactly one. */
const ROW = 1;

/**
 * The install's row, minting its seed the first time anything asks. Lazy rather
 * than a startup step: a server that came up before its database was ready would
 * otherwise have to decide whether to crash or to run with no identity.
 */
async function installRow() {
  const read = async () => (await control.select().from(serverLicense).where(eq(serverLicense.id, ROW)))[0];

  const existing = await read();
  if (existing) return existing;

  // Two requests hitting a cold server both try; the loser's insert is dropped
  // rather than raising, and both then read the same seed back.
  await control
    .insert(serverLicense)
    .values({ id: ROW, seed: randomBytes(16).toString('hex') })
    .onConflictDoNothing();
  return read();
}

/** Where this server stands today, and the Server ID the owner sends the vendor. */
export async function licenseStatus(): Promise<LicenseStatus> {
  const row = await installRow();
  const status = evaluateServerLicense(row);

  // The rollback rule remembers the furthest date this server has ever seen, so
  // the stamp only ever moves forward — writing an earlier "today" over it would
  // erase the very thing it is there to catch.
  const today = todayISO();
  if (status.state !== 'rolledBack' && (!row.lastSeen || row.lastSeen < today)) {
    await control.update(serverLicense).set({ lastSeen: today }).where(eq(serverLicense.id, ROW));
  }
  return status;
}

/** The owner pasting the `.lic` the vendor sent. Throws with the reason if it is refused. */
export async function installLicense(text: string): Promise<LicenseStatus> {
  const row = await installRow();
  const result = acceptServerLicense(row.seed, text);
  if (!result.ok || !result.license) {
    throw badRequest(result.reason ?? 'That licence is not valid for this server.');
  }

  await control
    .update(serverLicense)
    .set({
      // Store what was verified, not the raw text — a re-serialised object cannot
      // smuggle extra fields past a signature that never covered them.
      license: JSON.stringify(result.license),
      // Never backwards: installing a genuine renewal must not clear a rollback
      // that is still in force, or winding the clock back would be a way to
      // revive a licence that has really run out.
      lastSeen: row.lastSeen && row.lastSeen > todayISO() ? row.lastSeen : todayISO(),
      installedAt: new Date(),
    })
    .where(eq(serverLicense.id, ROW));

  return licenseStatus();
}

/** What a refused API call is told — the same words the gate puts on screen. */
export function licenseRefusal(status: LicenseStatus): string {
  if (status.state === 'expired') {
    return `This shop's licence ran out on ${status.expiry}. Ask the owner to install a renewal.`;
  }
  if (status.state === 'rolledBack') {
    return "The date on the shop's computer has been set back. Put it right, then try again.";
  }
  return 'This installation has not been activated yet. Ask the shop owner to install its licence.';
}
