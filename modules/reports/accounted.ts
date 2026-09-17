// The two halves of a day's trade.
//
// A shop can mark a bill, a payment or an expense as out of the books (see
// components/BooksToggle). Its own reports keep counting everything — the
// figure the counter recognises is the one the till took — so every total on
// this device stays what it always was, and this is what lets a report ALSO
// say, in one line, how much of that will never reach the accountant.
//
// Pure: no database, no React. The rows are already in hand on both platforms.

import { formatMoney } from '@/utils/format';

export interface AccountedSplit {
  /** Paise the accountant will see. */
  accounted: number;
  /** Paise kept out of the books. */
  nonAccounted: number;
  /** Always exactly `accounted + nonAccounted` — the report's own total. */
  total: number;
  accountedCount: number;
  nonAccountedCount: number;
}

/**
 * Split rows by whether they are in the books, netting `credits` (returns) off
 * the same side of the split they belong to — a credit note against an off-books
 * sale is off-books too, so the two halves still add up to the report's total.
 * Returns are not counted as documents, exactly as summarisePartyTotals treats
 * them: a return is not another bill.
 */
export function splitAccounted<T extends { accounted: boolean }>(
  rows: T[],
  value: (row: T) => number,
  credits: T[] = [],
): AccountedSplit {
  const sum = (list: T[], want: boolean) =>
    list.reduce((s, r) => (r.accounted === want ? s + value(r) : s), 0);
  const accounted = sum(rows, true) - sum(credits, true);
  const nonAccounted = sum(rows, false) - sum(credits, false);
  return {
    accounted,
    nonAccounted,
    total: accounted + nonAccounted,
    accountedCount: rows.filter((r) => r.accounted).length,
    nonAccountedCount: rows.filter((r) => !r.accounted).length,
  };
}

/**
 * The one line a report shows underneath its totals, or nothing at all when the
 * shop has marked nothing — which is the normal day, and deserves no words.
 *
 * `noun` is what one row is called here: 'bill', 'payment', 'expense'.
 */
export function accountedNote(split: AccountedSplit, noun: string): string {
  if (split.nonAccountedCount === 0) return '';
  const many = split.nonAccountedCount === 1 ? noun : `${noun}s`;
  return `${formatMoney(split.nonAccounted)} across ${split.nonAccountedCount} ${many} is not in the books — your accountant's copy shows ${formatMoney(split.accounted)}.`;
}
