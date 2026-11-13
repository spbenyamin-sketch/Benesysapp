// Receivables (and payables) aging: not just "how much is owed" but "how long
// has it been owed". The Outstanding report answers the first question; this one is what a
// shopkeeper needs before deciding whose door to knock on.
//
// The money is aged by allocating everything that has been settled against the
// OLDEST bills first — the way a shop actually reads its own book. What is left
// unsettled is therefore the newest bills, each aged from the day it fell due
// (or the day it was billed, when no term was agreed). Because the allocation
// starts from the party's derived balance, the buckets always add back to the
// same figure the ledger and the Outstanding report show.

import { listInvoices } from '@/modules/invoices/service';
import { dueDayOf } from '@/modules/invoices/due';
import {
  invoiceDelta,
  listPartiesWithBalance,
  type PartyWithBalance,
} from '@/modules/parties/ledger';
import { daysBetween } from '@/utils/format';
import type { Party } from '@/db/schema';

export interface AgingBucket {
  key: string;
  label: string;
  /** Inclusive lower bound in days; the last bucket has no upper bound. */
  from: number;
  to: number;
}

export const AGING_BUCKETS: AgingBucket[] = [
  { key: '0-30', label: '0–30 days', from: 0, to: 30 },
  { key: '31-60', label: '31–60 days', from: 31, to: 60 },
  { key: '61-90', label: '61–90 days', from: 61, to: 90 },
  { key: '90+', label: 'Over 90 days', from: 91, to: Number.POSITIVE_INFINITY },
];

/** One thing that put the party into debt: a bill, or their opening balance. */
export interface AgingCharge {
  /** The day this money is aged from — see dueDayOf. */
  day: string;
  amount: number; // paise, always positive
}

export interface AgedParty {
  buckets: number[]; // one per AGING_BUCKETS, adds up to `total`
  total: number; // paise still outstanding
  oldestDays: number; // age of the oldest money still unsettled; 0 when nothing is
}

/**
 * Which bucket an age falls in. Money not yet due (a negative age, because the
 * due date is still ahead) belongs in the first bucket — it is outstanding, it
 * is simply not late.
 */
export function bucketIndexFor(days: number): number {
  const i = AGING_BUCKETS.findIndex((b) => days >= b.from && days <= b.to);
  return i === -1 ? 0 : i;
}

/**
 * Age one party's debt.
 *
 * `settled` is everything that has come back — payments received and goods
 * returned — applied oldest bill first. Anything beyond the charges is ignored
 * rather than allowed to push a bucket negative: an over-payment is a credit,
 * not a debt of minus ten days.
 */
export function ageCharges(charges: AgingCharge[], settled: number, asOf: string): AgedParty {
  const buckets = AGING_BUCKETS.map(() => 0);
  let credit = Math.max(0, settled);
  let total = 0;
  let oldestDays = 0;

  for (const charge of [...charges].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    const applied = Math.min(credit, charge.amount);
    credit -= applied;
    const left = charge.amount - applied;
    if (left <= 0) continue;
    const days = daysBetween(charge.day, asOf);
    buckets[bucketIndexFor(days)] += left;
    total += left;
    if (days > oldestDays) oldestDays = days;
  }

  return { buckets, total, oldestDays };
}

export interface AgingRow extends AgedParty {
  party: Party;
}

/**
 * Which way the money runs. Receivable: what parties owe the shop. Payable:
 * what the shop owes its suppliers (or anyone it holds a credit for).
 */
export type AgingSide = 'receivable' | 'payable';

export interface AgingReport {
  asOf: string;
  side: AgingSide;
  rows: AgingRow[]; // most owed first
  buckets: number[]; // column totals
  total: number;
}

/** The fields of an invoice the allocation needs — kept narrow so it is testable. */
export type AgeableInvoice = Parameters<typeof invoiceDelta>[0];

/**
 * The pure half of the report: age every party whose derived balance runs the
 * chosen way. A payable is the exact mirror of a receivable — the sign is
 * flipped once, here, and everything below is the same oldest-charge-first
 * rule, so the buckets add back to the ledger balance on either side.
 */
export function buildAging(
  balances: PartyWithBalance[],
  invoices: AgeableInvoice[],
  asOf: string,
  side: AgingSide = 'receivable',
): AgingReport {
  const sign = side === 'receivable' ? 1 : -1;

  const chargesByParty = new Map<number, AgingCharge[]>();
  for (const inv of invoices) {
    const delta = sign * invoiceDelta(inv);
    // Only what INCREASED the debt is a charge to age — sales for a receivable,
    // purchases for a payable. Everything running the other way (returns,
    // payments) is counted as settlement below.
    if (delta <= 0) continue;
    const list = chargesByParty.get(inv.partyId) ?? [];
    list.push({ day: dueDayOf(inv), amount: delta });
    chargesByParty.set(inv.partyId, list);
  }

  const rows: AgingRow[] = [];
  for (const { party, balance: signed } of balances) {
    const balance = sign * signed;
    if (balance <= 0) continue;
    const charges = [...(chargesByParty.get(party.id) ?? [])];
    // A balance carried in from the old book is the oldest debt there is, dated
    // from the day the party was added.
    const opening = sign * party.openingBalance;
    if (opening > 0) {
      charges.push({ day: party.createdAt.slice(0, 10), amount: opening });
    }
    const chargeTotal = charges.reduce((s, c) => s + c.amount, 0);
    const aged = ageCharges(charges, chargeTotal - balance, asOf);
    // Money owed with no bill behind it — cash handed back to a customer, say.
    // It is owed as of now, so it goes in the newest bucket rather than being
    // dropped: the row must always add up to the balance the ledger shows.
    const unbilled = balance - aged.total;
    if (unbilled > 0) {
      aged.buckets[0] += unbilled;
      aged.total += unbilled;
    }
    rows.push({ party, ...aged });
  }

  rows.sort((a, b) => b.total - a.total);
  return {
    asOf,
    side,
    rows,
    buckets: AGING_BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0)),
    total: rows.reduce((s, r) => s + r.total, 0),
  };
}

/**
 * Everyone who owes the shop money (receivable), or everyone the shop owes
 * (payable), with that money split by age. Anyone settled, or whose balance
 * runs the other way, drops out: this report exists to be worked through, and
 * a row with nothing to chase is a row in the way.
 */
export async function agingReport(
  asOf?: string,
  side: AgingSide = 'receivable',
): Promise<AgingReport> {
  const day = asOf ?? new Date().toISOString().slice(0, 10);
  const [balances, invoices] = await Promise.all([listPartiesWithBalance(), listInvoices()]);
  return buildAging(balances, invoices, day, side);
}
