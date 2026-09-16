// What a licence check can conclude, and when to start warning — shared by the
// phone (service.ts, SecureStore) and by Online mode (serverLicense.ts, the
// server's database). Kept in its own file because it is the one part both
// halves must agree on: if the web thought "expiring" started at 3 days and the
// phone at 7, the same shop would be told two different stories.
//
// Pure: no SecureStore, no database, nothing platform-specific.

/** Warn the shop this many days out, so a renewal can be arranged in time. */
export const WARN_DAYS = 7;

export type LicenseState = 'unlicensed' | 'active' | 'expiring' | 'expired' | 'rolledBack';

export interface LicenseStatus {
  state: LicenseState;
  /** The System ID this copy is bound to — a phone's, or a server's. */
  systemId: string;
  expiry?: string;
  /** Negative once the date has passed. */
  daysLeft?: number;
  /** Shop name the licence was issued to, when there is one. */
  client?: string;
}

/** True while the app is allowed to open. 'expiring' still works — it only warns. */
export function isUsable(status: LicenseStatus): boolean {
  return status.state === 'active' || status.state === 'expiring';
}
