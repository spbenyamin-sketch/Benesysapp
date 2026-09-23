import { listInvoices, listInvoicesByParty } from '@/modules/invoices/service';
import { listParties } from '@/modules/parties/service';
import { getParty } from '@/modules/parties/service';
import { listPayments, listPaymentsByParty, paymentDirection } from '@/modules/payments/service';
import type { Invoice, Party, Payment } from '@/db/schema';

// ── Party ledger (balances are COMPUTED from transactions, never stored) ──────
// Sign convention (see db/schema.ts):
//   balance > 0  → the party owes YOU   (receivable)
//   balance < 0  → YOU owe the party    (payable)
// Sales, purchases and sale returns are financial; quotations/challans are not.

export type LedgerKind =
  | 'opening'
  | 'sale'
  | 'purchase'
  | 'saleReturn'
  | 'purchaseReturn'
  | 'payment';

export interface LedgerEntry {
  key: string;
  date: string; // ISO
  kind: LedgerKind;
  label: string;
  delta: number; // signed paise; + increases what the party owes you
  balance: number; // running balance after this entry
}

/**
 * The period a ledger was asked for. Either end may be blank, which means "no
 * limit that side" — a shop asking "what has this customer done since April"
 * should not have to name today's date to get an answer.
 */
export interface LedgerRange {
  from?: string; // ISO 'YYYY-MM-DD', inclusive
  to?: string; // ISO 'YYYY-MM-DD', inclusive
}

export interface PartyLedger {
  party: Party;
  entries: LedgerEntry[];
  /** Closing balance of the entries shown — the whole account when no period. */
  balance: number;
  /**
   * What the party owes today, whatever period is on screen. A statement can be
   * asked for last April; a reminder must never quote last April's figure.
   */
  outstanding: number;
  /** Set only when a period was asked for; the statement prints it. */
  range?: LedgerRange;
}

export interface PartyWithBalance {
  party: Party;
  balance: number;
}

/**
 * What one document does to the party's balance. Exported because the aging
 * report has to age exactly the charges this ledger counts — two answers to
 * "how much do they owe" would be one answer too many.
 */
export function invoiceDelta(inv: Invoice): number {
  if (inv.type === 'sale') return inv.grandTotal; // customer owes us more
  if (inv.type === 'purchase') return -inv.grandTotal; // we owe the supplier
  // Goods came back: the customer owes that much less — and if they had already
  // paid, the balance goes negative, which is exactly the refund we owe them.
  if (inv.type === 'saleReturn') return -inv.grandTotal;
  // Goods went back to the supplier: we owe them that much less — and if they
  // had already been paid, the balance goes positive, which is exactly the
  // refund they owe us.
  if (inv.type === 'purchaseReturn') return inv.grandTotal;
  return 0; // quotation / challan → non-financial
}

const LEDGER_KIND: Partial<Record<Invoice['type'], LedgerKind>> = {
  sale: 'sale',
  purchase: 'purchase',
  saleReturn: 'saleReturn',
  purchaseReturn: 'purchaseReturn',
};

const LEDGER_LABEL: Partial<Record<Invoice['type'], string>> = {
  sale: 'Sale',
  purchase: 'Purchase',
  saleReturn: 'Sale return',
  purchaseReturn: 'Purchase return',
};

// A recorded payment moves the balance by the direction it actually ran: money
// received (in) shrinks a receivable, money paid (out) shrinks a payable. The
// direction is stored on the row now, so a refund to a customer — money out to
// someone who normally pays in — lands on the correct side.
function paymentDelta(payment: Payment, party: Party): number {
  return paymentDirection(payment, party.type) === 'out' ? payment.amount : -payment.amount;
}

/** Dates are stored as 'YYYY-MM-DD' rows and full ISO timestamps alike. */
const day = (iso: string) => iso.slice(0, 10);

export async function getPartyLedger(
  partyId: number,
  range?: LedgerRange,
): Promise<PartyLedger | null> {
  const party = await getParty(partyId);
  if (!party) return null;

  const [invoices, payments] = await Promise.all([
    listInvoicesByParty(partyId),
    listPaymentsByParty(partyId),
  ]);

  const from = range?.from ?? '';
  const to = range?.to ?? '';

  const txns: Omit<LedgerEntry, 'balance'>[] = [];
  for (const inv of invoices) {
    const delta = invoiceDelta(inv);
    if (delta === 0) continue;
    txns.push({
      key: `inv-${inv.id}`,
      date: inv.date,
      kind: LEDGER_KIND[inv.type] ?? 'sale',
      label: `${LEDGER_LABEL[inv.type] ?? 'Sale'} · ${inv.invoiceNo}`,
      delta,
    });
  }
  for (const p of payments) {
    const dir = paymentDirection(p, party.type);
    txns.push({
      key: `pay-${p.id}`,
      date: p.date,
      kind: 'payment',
      label: `${dir === 'in' ? 'Payment in' : 'Payment out'} · ${p.mode.toUpperCase()}`,
      delta: paymentDelta(p, party),
    });
  }

  // Opening stays first (it's the starting point); transactions run by date.
  txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // A period cannot simply hide the earlier rows: everything before it is what
  // the party already owed on day one of the period, so it is folded into the
  // opening figure. Cut them away instead and every running balance on the page
  // would be wrong — which is exactly the argument a statement has to survive.
  const before = from ? txns.filter((t) => day(t.date) < from) : [];
  const within = txns.filter(
    (t) => (!from || day(t.date) >= from) && (!to || day(t.date) <= to),
  );

  const opening: Omit<LedgerEntry, 'balance'> = {
    key: 'opening',
    date: from || party.createdAt,
    kind: 'opening',
    label: before.length ? 'Balance brought forward' : 'Opening balance',
    delta: before.reduce((sum, t) => sum + t.delta, party.openingBalance),
  };

  let running = 0;
  const entries: LedgerEntry[] = [opening, ...within].map((e) => {
    running += e.delta;
    return { ...e, balance: running };
  });

  return {
    party,
    entries,
    balance: running,
    outstanding: txns.reduce((sum, t) => sum + t.delta, party.openingBalance),
    ...(from || to ? { range: { from, to } } : {}),
  };
}

// Balances for the whole party list in one pass — cheap for a single-user local DB.
export async function listPartiesWithBalance(): Promise<PartyWithBalance[]> {
  const [parties, invoices, payments] = await Promise.all([
    listParties(),
    listInvoices(),
    listPayments(),
  ]);

  const balanceById = new Map<number, number>();
  const typeById = new Map<number, Party['type']>();
  for (const p of parties) {
    balanceById.set(p.id, p.openingBalance);
    typeById.set(p.id, p.type);
  }

  for (const inv of invoices) {
    const current = balanceById.get(inv.partyId);
    if (current === undefined) continue;
    balanceById.set(inv.partyId, current + invoiceDelta(inv));
  }
  for (const pay of payments) {
    const current = balanceById.get(pay.partyId);
    if (current === undefined) continue;
    const type = typeById.get(pay.partyId) ?? 'customer';
    const delta = paymentDirection(pay, type) === 'out' ? pay.amount : -pay.amount;
    balanceById.set(pay.partyId, current + delta);
  }

  return parties.map((party) => ({ party, balance: balanceById.get(party.id) ?? 0 }));
}
