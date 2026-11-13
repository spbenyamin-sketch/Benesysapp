// This installation's licence, kept in the control database.
//
// It sits next to the sign-in code because it answers the same kind of question
// one level up: not "may this person use the shop" but "may this server be used
// at all". The rules themselves — how the Server ID is derived, what counts as
// expired, the clock-rollback check — are shared with the phone in
// modules/license/serverLicense.ts, so there is one licence format and one key.

import { randomBytes } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { todayISO } from '@/modules/license/dates';
import { acceptServerLicense, evaluateServerLicense } from '@/modules/license/serverLicense';
import type { LicenseStatus } from '@/modules/license/status';
import { control } from '../db/client';
import { serverLicense, shops } from '../db/control-schema';
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
    .values({ id: ROW, seed: randomBytes(16).toString('hex'), trialStart: await trialStartFor() })
    .onConflictDoNothing();
  return read();
}

/**
 * Day one of the trial for a row being (re)created: today, unless this server
 * already has a shop — then the day the oldest one was registered.
 *
 * Why the shop and not a second "first seen" row: deleting `server_license` is
 * the obvious way to try for a fresh 7 days, and a second row in the same
 * database would go with one more DELETE. The shop cannot be deleted without
 * taking the books with it — which is the thing the trial exists to let people
 * try — so its date is the one record of "this install has been in use since"
 * that is not worth wiping. No migration, and nothing new to keep in step.
 *
 * Only for a missing row. A row that exists but predates the trial (trial_start
 * still null) keeps getting today, below — those installs were promised a trial
 * starting from the update, not from the day they first registered.
 */
async function trialStartFor(): Promise<string> {
  const today = todayISO();
  const [oldest] = await control
    .select({ createdAt: shops.createdAt })
    .from(shops)
    .orderBy(asc(shops.createdAt))
    .limit(1);
  if (!oldest) return today;
  const since = todayISO(oldest.createdAt);
  return since < today ? since : today;
}

/** Where this server stands today, and the Server ID the owner sends the vendor. */
export async function licenseStatus(): Promise<LicenseStatus> {
  let row = await installRow();
  // Installs from before the trial existed have no start date; their trial
  // begins the first time they are asked after the update.
  if (!row.trialStart) {
    await control.update(serverLicense).set({ trialStart: todayISO() }).where(eq(serverLicense.id, ROW));
    row = await installRow();
  }
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
  if (status.state === 'expired' && status.trial) {
    return "This shop's 7-day free trial ended on " + status.expiry + '. Ask the owner to install its licence.';
  }
  if (status.state === 'expired') {
    return `This shop's licence ran out on ${status.expiry}. Ask the owner to install a renewal.`;
  }
  if (status.state === 'rolledBack') {
    return "The date on the shop's computer has been set back. Put it right, then try again.";
  }
  return 'This installation has not been activated yet. Ask the shop owner to install its licence.';
}
