// What a licence check can conclude, and when to start warning — shared by the
// phone (service.ts, SecureStore) and by Online mode (serverLicense.ts, the
// server's database). Kept in its own file because it is the one part both
// halves must agree on: if the web thought "expiring" started at 3 days and the
// phone at 7, the same shop would be told two different stories.
//
// Pure: no SecureStore, no database, nothing platform-specific.

import { addDays, daysBetween } from './dates';

/** Warn the shop this many days out, so a renewal can be arranged in time. */
export const WARN_DAYS = 7;

/** A fresh install runs this many days before it asks for a licence. */
export const TRIAL_DAYS = 7;

export type LicenseState = 'unlicensed' | 'trial' | 'active' | 'expiring' | 'expired' | 'rolledBack';

export interface LicenseStatus {
  state: LicenseState;
  /** The System ID this copy is bound to — a phone's, or a server's. */
  systemId: string;
  expiry?: string;
  /** Negative once the date has passed. */
  daysLeft?: number;
  /** Shop name the licence was issued to, when there is one. */
  client?: string;
  /** True when the dates above belong to the free trial, not a licence. */
  trial?: boolean;
}

/** True while the app is allowed to open. 'expiring' and 'trial' still work — they only warn. */
export function isUsable(status: LicenseStatus): boolean {
  return status.state === 'active' || status.state === 'expiring' || status.state === 'trial';
}

/**
 * Where a free trial that began on `start` stands on `today`.
 *
 * The start day counts as day one, so a 7-day trial begun on the 1st runs
 * through the 7th and locks on the 8th. `expiry` is that last usable day, which
 * makes `daysLeft` read exactly as it does for a real licence.
 */
export function evaluateTrial(systemId: string, start: string, today: string): LicenseStatus {
  const expiry = addDays(start, TRIAL_DAYS - 1);
  const daysLeft = daysBetween(today, expiry);
  // A clock set before the trial began is the same trick as winding back past
  // the last run — refuse it the same way.
  if (today < start) return { state: 'rolledBack', systemId, expiry, daysLeft, trial: true };
  if (daysLeft < 0) return { state: 'expired', systemId, expiry, daysLeft, trial: true };
  return { state: 'trial', systemId, expiry, daysLeft, trial: true };
}
