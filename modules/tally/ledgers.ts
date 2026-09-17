// Every name this export can put in front of Tally, in one place.
//
// Tally matches ledgers by their EXACT name: "Sales @ 18%" and "Sales 18%" are
// two different ledgers, and a mismatch does not fail the import — it silently
// creates a second account and splits a year of trade across both. So no name
// is ever written inline at the point of use; they all come from here, which is
// also what lets one test assert that every name a voucher mentions has a master.

import { formatTaxRate } from '@/utils/format';
import type { TallyExpense, TallyParty, TallyPayment } from './types';

/** Where a slab's sales go. 1800 → 'Sales @ 18%'. */
export const salesLedger = (taxRate: number): string => `Sales @ ${formatTaxRate(taxRate)}`;

/** The buying side of the same. */
export const purchaseLedger = (taxRate: number): string => `Purchase @ ${formatTaxRate(taxRate)}`;

export type DutyHead = 'CGST' | 'SGST' | 'IGST';
/** Output on what the shop sold, Input on what it bought — never netted into
 *  one ledger, because a CA reconciles the two separately and a wrongly-signed
 *  entry should be visible rather than quietly cancelling another. */
export const dutyLedger = (head: DutyHead, side: 'output' | 'input'): string =>
  `${side === 'output' ? 'Output' : 'Input'} ${head}`;

export const ROUND_OFF = 'Round Off';
export const DISCOUNT_ALLOWED = 'Discount Allowed';
export const DISCOUNT_RECEIVED = 'Discount Received';
export const CASH = 'Cash';
export const BANK = 'Bank';

/** Which group a ledger is created under, by the name it was given. */
export function ledgerParent(name: string): string {
  if (name.startsWith('Sales @')) return 'Sales Accounts';
  if (name.startsWith('Purchase @')) return 'Purchase Accounts';
  if (name.startsWith('Output ') || name.startsWith('Input ')) return 'Duties & Taxes';
  if (name === DISCOUNT_RECEIVED) return 'Indirect Incomes';
  if (name === CASH) return 'Cash-in-Hand';
  if (name === BANK) return 'Bank Accounts';
  // Round Off, Discount Allowed and every expense head.
  return 'Indirect Expenses';
}

export const partyParent = (type: TallyParty['type']): string =>
  type === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors';

/**
 * The cash box or bank account money moved through. A shop that never set one
 * up still has to post somewhere, so the mode decides: cash stays cash, and
 * everything that travels down a wire is a bank.
 */
export function accountLedger(row: Pick<TallyPayment, 'accountName' | 'accountType' | 'mode'>): string {
  const named = (row.accountName ?? '').trim();
  if (named) return named;
  return row.mode === 'cash' ? CASH : BANK;
}

/** The same for an expense, which has no mode — unrecorded means the till. */
export function expenseAccountLedger(row: Pick<TallyExpense, 'accountName' | 'accountType'>): string {
  const named = (row.accountName ?? '').trim();
  if (named) return named;
  return CASH;
}

/** The head an overhead is booked to. The app's categories already read like
 *  Tally ledgers — Rent, Electricity, Bank Charges — so they are used as they
 *  are, and a shop that typed its own gets that. */
export const expenseLedger = (category: string): string => category.trim() || 'Miscellaneous';

/**
 * Where the goods were supplied. The same fallback chain the printed bill and
 * the GST return use — the bill first, then where the party lives, then the
 * shop's own state — so the place named on a voucher can never disagree with
 * the CGST/SGST-or-IGST split that was decided from it.
 */
export function placeOfSupplyOf(
  invoicePlace: string | null | undefined,
  partyState: string | null | undefined,
  businessState: string,
): string {
  return (invoicePlace || '').trim() || (partyState || '').trim() || businessState.trim();
}

/** Ledgers in the order Tally should meet them: groups it may need first. */
export function sortLedgerNames(names: Iterable<string>): string[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
