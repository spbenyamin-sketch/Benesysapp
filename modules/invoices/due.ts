// When a bill's money is expected, and when it is late. Pure — no DB — so the
// bills list, the invoice screen and the aging report all answer the question
// the same way.

import { daysBetween } from '@/utils/format';

/** The document types money is actually owed on. */
const OWES_MONEY = new Set(['sale', 'purchase']);

export interface DueLike {
  type: string;
  date: string; // ISO day
  dueDate?: string | null; // ISO day; null = nothing was agreed
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
}

/**
 * The day a bill's money is counted from: the due date when one was agreed,
 * otherwise the day of the bill itself. Used for AGEING — money that has been
 * sitting out for sixty days is sixty days old whether or not a term was set.
 */
export function dueDayOf(inv: DueLike): string {
  return inv.dueDate || inv.date;
}

/** Days past the due day as of `today`; zero or less means it has not fallen due. */
export function daysOverdue(inv: DueLike, today: string): number {
  return daysBetween(dueDayOf(inv), today);
}

/**
 * Whether to call a bill LATE to the shopkeeper's face.
 *
 * Deliberately stricter than ageing: it needs a due date that was actually
 * agreed. A shop that never sets one would otherwise see every credit bill from
 * yesterday flagged red, and a warning that is always on is not a warning.
 */
export function isOverdue(inv: DueLike, today: string): boolean {
  if (!inv.dueDate) return false;
  if (!OWES_MONEY.has(inv.type)) return false;
  if (inv.paymentStatus === 'paid') return false;
  return daysOverdue(inv, today) > 0;
}
