// The day book: one day, everything that happened, in the order a shopkeeper
// would tell you about it. Bills first, then the money that actually moved.
//
// The distinction that makes it honest is `cash`. A credit sale is a bill, not
// money — it belongs on the page, but counting it as cash in would tell the shop
// it has takings it has not received. Only payments and expenses move cash, and
// a quick bill moves it through its payment row, so nothing is counted twice.

import { listExpenses } from '@/modules/expenses/service';
import { listInvoicesWithParty } from '@/modules/invoices/service';
import { listPaymentsWithParty, paymentDirection } from '@/modules/payments/service';

export type DayBookKind =
  | 'sale'
  | 'saleReturn'
  | 'purchase'
  | 'purchaseReturn'
  | 'paymentIn'
  | 'paymentOut'
  | 'expense';

/** The order a day book reads in: what was billed, then what was paid. */
const KIND_ORDER: DayBookKind[] = [
  'sale',
  'saleReturn',
  'purchase',
  'purchaseReturn',
  'paymentIn',
  'paymentOut',
  'expense',
];

export const DAY_BOOK_LABEL: Record<DayBookKind, string> = {
  sale: 'Sale',
  saleReturn: 'Sale return',
  purchase: 'Purchase',
  purchaseReturn: 'Purchase return',
  paymentIn: 'Received',
  paymentOut: 'Paid',
  expense: 'Expense',
};

export interface DayBookEntry {
  key: string;
  kind: DayBookKind;
  title: string; // the bill number, or what the money was for
  sub: string; // who it was with
  amount: number; // paise, always positive — the kind says which way it runs
  /** Whether money actually changed hands. A bill on credit did not. */
  cash: boolean;
  invoiceId?: number;
  partyId?: number;
}

export interface DayBookSummary {
  cashIn: number;
  cashOut: number;
  netCash: number;
  salesBilled: number;
  returnsBilled: number;
  purchasesBilled: number;
  purchaseReturnsBilled: number;
  expenses: number;
}

export interface DayBook {
  day: string;
  entries: DayBookEntry[];
  summary: DayBookSummary;
}

/**
 * Add a day's entries up. Pure, and deliberately the only place the cash rules
 * live: money in and out come from what moved, while the "billed" figures are
 * what was written up, whether or not it has been paid for.
 */
export function summariseDayBook(entries: DayBookEntry[]): DayBookSummary {
  const total = (kind: DayBookKind) =>
    entries.reduce((s, e) => s + (e.kind === kind ? e.amount : 0), 0);
  const cashIn = entries.reduce((s, e) => s + (e.cash && e.kind === 'paymentIn' ? e.amount : 0), 0);
  const cashOut = entries.reduce(
    (s, e) => s + (e.cash && (e.kind === 'paymentOut' || e.kind === 'expense') ? e.amount : 0),
    0,
  );
  return {
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    salesBilled: total('sale'),
    returnsBilled: total('saleReturn'),
    purchasesBilled: total('purchase'),
    purchaseReturnsBilled: total('purchaseReturn'),
    expenses: total('expense'),
  };
}

/** Sort into reading order; within a kind, biggest first. */
export function orderDayBook(entries: DayBookEntry[]): DayBookEntry[] {
  return [...entries].sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return byKind !== 0 ? byKind : b.amount - a.amount;
  });
}

const INVOICE_KIND: Record<string, DayBookKind | undefined> = {
  sale: 'sale',
  saleReturn: 'saleReturn',
  purchase: 'purchase',
  purchaseReturn: 'purchaseReturn',
};

/** Everything that happened on one day. */
export async function dayBook(day: string): Promise<DayBook> {
  const [invoices, payments, expenses] = await Promise.all([
    listInvoicesWithParty(),
    listPaymentsWithParty(),
    listExpenses(),
  ]);

  const entries: DayBookEntry[] = [];

  for (const inv of invoices) {
    if (inv.date !== day) continue;
    const kind = INVOICE_KIND[inv.type];
    // Quotations and challans move neither goods' money nor cash — a day book
    // full of documents that changed nothing is a day book nobody reads.
    if (!kind) continue;
    entries.push({
      key: `inv-${inv.id}`,
      kind,
      title: inv.invoiceNo,
      sub: inv.partyName,
      amount: inv.grandTotal,
      cash: false,
      invoiceId: inv.id,
      partyId: inv.partyId,
    });
  }

  for (const pay of payments) {
    if (pay.date !== day) continue;
    const direction = paymentDirection(pay, pay.partyType);
    entries.push({
      key: `pay-${pay.id}`,
      kind: direction === 'in' ? 'paymentIn' : 'paymentOut',
      title: pay.invoiceNo ?? 'On account',
      sub: `${pay.partyName} · ${pay.mode.toUpperCase()}`,
      amount: pay.amount,
      cash: true,
      partyId: pay.partyId,
    });
  }

  for (const exp of expenses) {
    if (exp.date !== day) continue;
    entries.push({
      key: `exp-${exp.id}`,
      kind: 'expense',
      title: exp.category,
      sub: exp.notes ?? '',
      amount: exp.amount,
      cash: true,
    });
  }

  const ordered = orderDayBook(entries);
  return { day, entries: ordered, summary: summariseDayBook(ordered) };
}
