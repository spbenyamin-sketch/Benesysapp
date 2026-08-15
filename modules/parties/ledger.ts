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

export type LedgerKind = 'opening' | 'sale' | 'purchase' | 'saleReturn' | 'payment';

export interface LedgerEntry {
  key: string;
  date: string; // ISO
  kind: LedgerKind;
  label: string;
  delta: number; // signed paise; + increases what the party owes you
  balance: number; // running balance after this entry
}

export interface PartyLedger {
  party: Party;
  entries: LedgerEntry[];
  balance: number;
}

export interface PartyWithBalance {
  party: Party;
  balance: number;
}

function invoiceDelta(inv: Invoice): number {
  if (inv.type === 'sale') return inv.grandTotal; // customer owes us more
  if (inv.type === 'purchase') return -inv.grandTotal; // we owe the supplier
  // Goods came back: the customer owes that much less — and if they had already
  // paid, the balance goes negative, which is exactly the refund we owe them.
  if (inv.type === 'saleReturn') return -inv.grandTotal;
  return 0; // quotation / challan → non-financial
}

const LEDGER_KIND: Partial<Record<Invoice['type'], LedgerKind>> = {
  sale: 'sale',
  purchase: 'purchase',
  saleReturn: 'saleReturn',
};

const LEDGER_LABEL: Partial<Record<Invoice['type'], string>> = {
  sale: 'Sale',
  purchase: 'Purchase',
  saleReturn: 'Sale return',
};

// A recorded payment moves the balance by the direction it actually ran: money
// received (in) shrinks a receivable, money paid (out) shrinks a payable. The
// direction is stored on the row now, so a refund to a customer — money out to
// someone who normally pays in — lands on the correct side.
function paymentDelta(payment: Payment, party: Party): number {
  return paymentDirection(payment, party.type) === 'out' ? payment.amount : -payment.amount;
}

export async function getPartyLedger(partyId: number): Promise<PartyLedger | null> {
  const party = await getParty(partyId);
  if (!party) return null;

  const [invoices, payments] = await Promise.all([
    listInvoicesByParty(partyId),
    listPaymentsByParty(partyId),
  ]);

  const opening: Omit<LedgerEntry, 'balance'> = {
    key: 'opening',
    date: party.createdAt,
    kind: 'opening',
    label: 'Opening balance',
    delta: party.openingBalance,
  };

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

  let running = 0;
  const entries: LedgerEntry[] = [opening, ...txns].map((e) => {
    running += e.delta;
    return { ...e, balance: running };
  });

  return { party, entries, balance: running };
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
