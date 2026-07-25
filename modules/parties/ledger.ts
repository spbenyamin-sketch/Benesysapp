import { listInvoices, listInvoicesByParty } from '@/modules/invoices/service';
import { listParties } from '@/modules/parties/service';
import { getParty } from '@/modules/parties/service';
import { listPayments, listPaymentsByParty } from '@/modules/payments/service';
import type { Invoice, Party, Payment } from '@/db/schema';

// ── Party ledger (balances are COMPUTED from transactions, never stored) ──────
// Sign convention (see db/schema.ts):
//   balance > 0  → the party owes YOU   (receivable)
//   balance < 0  → YOU owe the party    (payable)
// Only sale/purchase invoices are financial; quotations/challans are ignored.

export type LedgerKind = 'opening' | 'sale' | 'purchase' | 'payment';

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
  return 0; // quotation / challan → non-financial
}

// A recorded payment reduces whatever is outstanding, in whichever direction it
// runs: money received from a customer shrinks a receivable; money paid to a
// supplier shrinks a payable. (Phase 5 may refine direction once payments carry
// an explicit in/out flag.)
function paymentDelta(payment: Payment, party: Party): number {
  return party.type === 'supplier' ? payment.amount : -payment.amount;
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
      kind: inv.type === 'sale' ? 'sale' : 'purchase',
      label: `${inv.type === 'sale' ? 'Sale' : 'Purchase'} · ${inv.invoiceNo}`,
      delta,
    });
  }
  for (const p of payments) {
    txns.push({
      key: `pay-${p.id}`,
      date: p.date,
      kind: 'payment',
      label: `Payment · ${p.mode.toUpperCase()}`,
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
    const delta = typeById.get(pay.partyId) === 'supplier' ? pay.amount : -pay.amount;
    balanceById.set(pay.partyId, current + delta);
  }

  return parties.map((party) => ({ party, balance: balanceById.get(party.id) ?? 0 }));
}
