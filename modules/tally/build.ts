// The shop's month, written the way Tally reads it.
//
// Accounting vouchers only: no stock items, no inventory entries. A bill lands
// as "party against sales and GST", which is how a CA keeps a trading company's
// books, and it means an import cannot be refused over an item name, a unit or
// an HSN code the accountant's company has never heard of.
//
// Pure — no database, no React, no expo. Everything it needs is in the payload,
// which is why every rule below can be tested to the paise.
//
// The one fact the whole file rests on is the app's own invoice invariant
// (utils/gst.ts): subtotal + tax − discount + roundOff === grandTotal. Rearranged,
// that is exactly Tally's condition that a voucher's debits equal its credits —
// so a discounted, rounded, inclusive-tax bill balances here by construction,
// not by fiddling.

import { splitInclusive, splitTax, supplyType } from '@/utils/gst';
import {
  DISCOUNT_ALLOWED,
  DISCOUNT_RECEIVED,
  ROUND_OFF,
  accountLedger,
  dutyLedger,
  expenseAccountLedger,
  expenseLedger,
  ledgerParent,
  partyParent,
  placeOfSupplyOf,
  purchaseLedger,
  salesLedger,
  sortLedgerNames,
  type DutyHead,
} from './ledgers';
import type {
  TallyExpense,
  TallyInvoice,
  TallyParty,
  TallyPayload,
  TallyPayment,
  TallyOptions,
} from './types';
import { el, rupees, tag, tallyDate } from './xml';

// ── One side of one voucher ──────────────────────────────────────────────────

interface BillRef {
  /** The bill this money belongs to. Empty for On Account. */
  name: string;
  type: 'New Ref' | 'Agst Ref' | 'On Account';
  paise: number;
}

interface Entry {
  ledger: string;
  paise: number; // always positive; `debit` carries the direction
  debit: boolean;
  bills?: BillRef[];
}

/**
 * Tally's sign convention, and the reason nothing above this line deals in
 * negative money: a debit is a negative AMOUNT flagged ISDEEMEDPOSITIVE, a
 * credit is a positive one. Every voucher's AMOUNTs therefore add to zero.
 */
function entryXml(e: Entry): string {
  const amount = e.debit ? -e.paise : e.paise;
  const bills = (e.bills ?? [])
    .filter((b) => b.paise !== 0)
    .map((b) =>
      tag(
        'BILLALLOCATIONS.LIST',
        el('NAME', b.name) + el('BILLTYPE', b.type) + el('AMOUNT', rupees(e.debit ? -b.paise : b.paise)),
      ),
    )
    .join('');
  return tag(
    'ALLLEDGERENTRIES.LIST',
    el('LEDGERNAME', e.ledger) +
      el('ISDEEMEDPOSITIVE', e.debit ? 'Yes' : 'No') +
      el('AMOUNT', rupees(amount)) +
      bills,
  );
}

interface VoucherInput {
  vchType: string;
  date: string; // ISO
  number: string;
  remoteId: string;
  party?: string;
  partyGstin?: string | null;
  placeOfSupply?: string;
  reference?: string | null;
  referenceDate?: string | null;
  narration?: string | null;
  entries: Entry[];
}

function voucherXml(v: VoucherInput): string {
  const date = tallyDate(v.date);
  const body =
    el('DATE', date) +
    el('EFFECTIVEDATE', date) +
    el('VOUCHERTYPENAME', v.vchType) +
    el('VOUCHERNUMBER', v.number) +
    el('REFERENCE', v.reference) +
    el('REFERENCEDATE', v.referenceDate ? tallyDate(v.referenceDate) : null) +
    el('PARTYLEDGERNAME', v.party) +
    el('PARTYNAME', v.party) +
    el('PARTYGSTIN', v.partyGstin) +
    el('PLACEOFSUPPLY', v.placeOfSupply) +
    el('NARRATION', v.narration) +
    el('REMOTEID', v.remoteId) +
    el('PERSISTEDVIEW', 'Accounting Voucher View') +
    v.entries.filter((e) => e.paise !== 0).map(entryXml).join('');
  return tag(
    'TALLYMESSAGE',
    tag('VOUCHER', body, {
      VCHTYPE: v.vchType,
      ACTION: 'Create',
      OBJVIEW: 'Accounting Voucher View',
    }),
    { 'xmlns:UDF': 'TallyUDF' },
  );
}

// ── Slabs ────────────────────────────────────────────────────────────────────

/**
 * The bill's taxable value, grouped by GST rate, because that is what decides
 * which sales ledger each part of it belongs to.
 *
 * The slabs are then nudged to add up to the header's `subtotal` exactly. In
 * practice they already do — the header was summed from these very lines — but
 * the voucher must balance even for a row written by some older version of the
 * app, and an unbalanced voucher is refused by Tally with nothing to show for it.
 */
function slabsOf(inv: TallyInvoice): { taxRate: number; taxable: number }[] {
  const byRate = new Map<number, number>();
  for (const l of inv.lines) byRate.set(l.taxRate, (byRate.get(l.taxRate) ?? 0) + l.amount);
  const slabs = [...byRate.entries()]
    .map(([taxRate, taxable]) => ({ taxRate, taxable }))
    .sort((a, b) => a.taxRate - b.taxRate);
  if (!slabs.length) return [{ taxRate: 0, taxable: inv.subtotal }];
  const drift = inv.subtotal - slabs.reduce((s, x) => s + x.taxable, 0);
  if (drift !== 0) {
    const biggest = slabs.reduce((a, b) => (b.taxable > a.taxable ? b : a));
    biggest.taxable += drift;
  }
  return slabs;
}

/** The duty entries for a tax total, under the heads the supply attracts. */
function dutyEntries(
  taxTotal: number,
  place: string,
  bizState: string,
  side: 'output' | 'input',
  debit: boolean,
): Entry[] {
  const supply = supplyType(bizState, place);
  const split = splitTax(taxTotal, supply);
  const heads: [DutyHead, number][] = [
    ['CGST', split.cgst],
    ['SGST', split.sgst],
    ['IGST', split.igst],
  ];
  return heads
    .filter(([, paise]) => paise !== 0)
    .map(([head, paise]) => ({ ledger: dutyLedger(head, side), paise, debit }));
}

// ── Bills ────────────────────────────────────────────────────────────────────

const VCH_TYPE: Record<TallyInvoice['type'], string> = {
  sale: 'Sales',
  purchase: 'Purchase',
  saleReturn: 'Credit Note',
  purchaseReturn: 'Debit Note',
};

/**
 * A bill as ledger entries.
 *
 * Sale:   party Dr the whole bill · sales slabs and GST Cr · discount Dr.
 * Purchase: the mirror, against the buying ledgers and input GST.
 * Credit note: the sale with every side flipped — and still against the SAME
 *   `Sales @ 18%` ledger, not a separate "Sales Return" one, which is what
 *   Tally's own GST reporting expects to find.
 */
function invoiceEntries(inv: TallyInvoice, party: TallyParty, bizState: string): Entry[] {
  const sellingSide = inv.type === 'sale' || inv.type === 'saleReturn';
  // A sale debits the party; a purchase credits them; a note reverses its own
  // document.
  const partyDebit = inv.type === 'sale' || inv.type === 'purchaseReturn';
  const tradeLedger = sellingSide ? salesLedger : purchaseLedger;
  const side = sellingSide ? 'output' : 'input';
  const discountLedger = sellingSide ? DISCOUNT_ALLOWED : DISCOUNT_RECEIVED;
  const place = placeOfSupplyOf(inv.placeOfSupply, party.state, bizState);

  // A credit note is settled against the bill it gives back; a fresh bill opens
  // its own reference. An Agst Ref naming a bill Tally has never seen is
  // rejected outright, so a return whose original could not be found opens one
  // of its own instead.
  const against = inv.sourceInvoiceNo?.trim();
  const isNote = inv.type === 'saleReturn' || inv.type === 'purchaseReturn';
  const bills: BillRef[] = [
    {
      name: isNote && against ? against : inv.invoiceNo,
      type: isNote && against ? 'Agst Ref' : 'New Ref',
      paise: inv.grandTotal,
    },
  ];

  return [
    { ledger: party.name, paise: inv.grandTotal, debit: partyDebit, bills },
    ...slabsOf(inv).map((s) => ({
      ledger: tradeLedger(s.taxRate),
      paise: s.taxable,
      debit: !partyDebit,
    })),
    ...dutyEntries(inv.taxTotal, place, bizState, side, !partyDebit),
    // The bill discount was taken off the TAXED total, so it belongs to no slab
    // and cannot be apportioned honestly. It posts as itself — which is also
    // where an accountant expects to find it.
    { ledger: discountLedger, paise: inv.discount, debit: partyDebit },
    // The paise the counter rounded away. A bill rounded UP took more money
    // than its parts add to, so the difference sits opposite the party — which
    // is what makes `subtotal + tax − discount + roundOff === grandTotal` come
    // out as a voucher that balances.
    {
      ledger: ROUND_OFF,
      paise: Math.abs(inv.roundOff),
      debit: inv.roundOff > 0 ? !partyDebit : partyDebit,
    },
  ];
}

function invoiceVoucher(inv: TallyInvoice, party: TallyParty, bizState: string): string {
  const isNote = inv.type === 'saleReturn' || inv.type === 'purchaseReturn';
  return voucherXml({
    vchType: VCH_TYPE[inv.type],
    date: inv.date,
    number: inv.invoiceNo,
    remoteId: `benesys-inv-${inv.id}`,
    party: party.name,
    partyGstin: party.gstin,
    placeOfSupply: placeOfSupplyOf(inv.placeOfSupply, party.state, bizState),
    reference: isNote ? inv.sourceInvoiceNo ?? inv.invoiceNo : inv.invoiceNo,
    referenceDate: isNote ? inv.sourceDate ?? inv.date : inv.date,
    entries: invoiceEntries(inv, party, bizState),
  });
}

// ── Money in and out ─────────────────────────────────────────────────────────

const MODE_WORD: Record<TallyPayment['mode'], string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
};

/**
 * A receipt or a payment. Money in debits the cash box and credits the party;
 * money out is the mirror.
 *
 * A payment made against a bill knocks that bill off the party's outstanding
 * (`Agst Ref`); one made on account deliberately does NOT open a new reference —
 * `On Account` is what "this is not against any particular bill" means in Tally,
 * and a New Ref here would invent a pending bill nobody ever raised.
 */
function paymentVoucher(p: TallyPayment, party: TallyParty): string {
  const account = accountLedger(p);
  const bills: BillRef[] = [
    p.invoiceNo
      ? { name: p.invoiceNo, type: 'Agst Ref', paise: p.amount }
      : { name: '', type: 'On Account', paise: p.amount },
  ];
  const moneyIn = p.direction === 'in';
  return voucherXml({
    vchType: moneyIn ? 'Receipt' : 'Payment',
    date: p.date,
    number: `${moneyIn ? 'RCPT' : 'PYMT'}-${p.id}`,
    remoteId: `benesys-pay-${p.id}`,
    party: party.name,
    // The app has no narration; the mode is otherwise invisible once the money
    // is in a ledger called "Cash".
    narration: [MODE_WORD[p.mode], p.notes?.trim()].filter(Boolean).join(' · '),
    entries: [
      { ledger: account, paise: p.amount, debit: moneyIn },
      { ledger: party.name, paise: p.amount, debit: !moneyIn, bills },
    ],
  });
}

/**
 * An overhead. The amount the shop typed is gross, so the GST inside it is
 * backed out to its own input ledger — `splitInclusive` guarantees the two
 * halves add back to the gross, which is what keeps this voucher balanced.
 *
 * An expense carries no place of supply, so it is always treated as local:
 * CGST + SGST, never IGST. Said out loud on the export screen.
 */
function expenseVoucher(e: TallyExpense, bizState: string): string {
  const account = expenseAccountLedger(e);
  const { tax } = splitInclusive(e.amount, e.taxRate);
  return voucherXml({
    vchType: 'Payment',
    date: e.date,
    number: `EXP-${e.id}`,
    remoteId: `benesys-exp-${e.id}`,
    narration: e.notes?.trim() || null,
    entries: [
      { ledger: expenseLedger(e.category), paise: e.amount - tax, debit: true },
      ...dutyEntries(tax, bizState, bizState, 'input', true),
      { ledger: account, paise: e.amount, debit: false },
    ],
  });
}

// ── Masters ──────────────────────────────────────────────────────────────────

const GST_DUTY_HEAD: Record<string, string> = {
  CGST: 'Central Tax',
  SGST: 'State Tax',
  IGST: 'Integrated Tax',
};

function partyLedgerXml(p: TallyParty, bizState: string): string {
  const gstin = (p.gstin ?? '').trim();
  const address = [p.address, p.city].map((x) => (x ?? '').trim()).filter(Boolean);
  return tag(
    'TALLYMESSAGE',
    tag(
      'LEDGER',
      tag('NAME.LIST', el('NAME', p.name)) +
        el('PARENT', partyParent(p.type)) +
        // Without this, every Agst Ref on a receipt is ignored and the money
        // never knocks the right bill off the party's outstanding.
        el('ISBILLWISEON', 'Yes') +
        el('AFFECTSSTOCK', 'No') +
        el('COUNTRYNAME', 'India') +
        el('LEDSTATENAME', placeOfSupplyOf(null, p.state, bizState)) +
        el('GSTREGISTRATIONTYPE', gstin ? 'Regular' : 'Unregistered') +
        el('PARTYGSTIN', gstin || null) +
        el('LEDGERPHONE', p.phone) +
        (address.length
          ? tag('ADDRESS.LIST', address.map((a) => el('ADDRESS', a)).join(''), { TYPE: 'String' })
          : ''),
      { NAME: p.name, ACTION: 'Create' },
    ),
    { 'xmlns:UDF': 'TallyUDF' },
  );
}

function plainLedgerXml(name: string): string {
  const parent = ledgerParent(name);
  const head = name.startsWith('Output ') || name.startsWith('Input ')
    ? GST_DUTY_HEAD[name.split(' ')[1]] ?? ''
    : '';
  return tag(
    'TALLYMESSAGE',
    tag(
      'LEDGER',
      tag('NAME.LIST', el('NAME', name)) +
        el('PARENT', parent) +
        (head ? el('TAXTYPE', 'GST') + el('GSTDUTYHEAD', head) : '') +
        el('ISBILLWISEON', 'No') +
        el('AFFECTSSTOCK', 'No'),
      { NAME: name, ACTION: 'Create' },
    ),
    { 'xmlns:UDF': 'TallyUDF' },
  );
}

// ── The file ─────────────────────────────────────────────────────────────────

const ALL_KINDS = {
  sales: true,
  purchases: true,
  returns: true,
  payments: true,
  expenses: true,
};

/** Is this document one of the kinds the shop asked for? */
function wanted(type: TallyInvoice['type'], kinds: typeof ALL_KINDS): boolean {
  if (type === 'sale') return kinds.sales;
  if (type === 'purchase') return kinds.purchases;
  return kinds.returns;
}

export function buildTallyXml(payload: TallyPayload, options: TallyOptions = {}): string {
  const kinds = { ...ALL_KINDS, ...(options.kinds ?? {}) };
  const withMasters = options.masters !== false;
  const bizState = payload.business.state ?? '';
  const partyById = new Map(payload.parties.map((p) => [p.id, p]));

  const vouchers: string[] = [];
  const usedParties = new Set<number>();
  const usedLedgers = new Set<string>();

  // A ledger is only ever written because a voucher mentions it — a shop with
  // four thousand parties does not hand its accountant four thousand ledgers
  // for one month's trade.
  const remember = (xml: string, ledgers: string[], partyId?: number) => {
    vouchers.push(xml);
    ledgers.forEach((l) => usedLedgers.add(l));
    if (partyId !== undefined) usedParties.add(partyId);
  };

  for (const inv of payload.invoices) {
    if (!inv.accounted || !wanted(inv.type, kinds)) continue;
    const party = partyById.get(inv.partyId);
    if (!party) continue; // A bill with no party cannot be posted anywhere.
    const entries = invoiceEntries(inv, party, bizState);
    remember(
      invoiceVoucher(inv, party, bizState),
      entries.filter((e) => e.paise !== 0 && e.ledger !== party.name).map((e) => e.ledger),
      inv.partyId,
    );
  }

  if (kinds.payments) {
    for (const p of payload.payments) {
      if (!p.accounted) continue;
      const party = partyById.get(p.partyId);
      if (!party) continue;
      remember(paymentVoucher(p, party), [accountLedger(p)], p.partyId);
    }
  }

  if (kinds.expenses) {
    for (const e of payload.expenses) {
      if (!e.accounted) continue;
      const { tax } = splitInclusive(e.amount, e.taxRate);
      const duties = dutyEntries(tax, bizState, bizState, 'input', true).map((d) => d.ledger);
      remember(expenseVoucher(e, bizState), [
        expenseLedger(e.category),
        expenseAccountLedger(e),
        ...duties,
      ]);
    }
  }

  const masters = withMasters
    ? [
        ...payload.parties.filter((p) => usedParties.has(p.id)).map((p) => partyLedgerXml(p, bizState)),
        ...sortLedgerNames(usedLedgers).map(plainLedgerXml),
      ]
    : [];

  const requestData = tag('REQUESTDATA', masters.join('') + vouchers.join(''));
  const desc = tag(
    'REQUESTDESC',
    el('REPORTNAME', 'Vouchers') +
      tag('STATICVARIABLES', el('SVCURRENTDATE', tallyDate(payload.to))),
  );
  const envelope = tag(
    'ENVELOPE',
    tag('HEADER', el('TALLYREQUEST', 'Import Data')) +
      tag('BODY', tag('IMPORTDATA', desc + requestData)),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${envelope}\n`;
}

/** What the export screen counts before the shop presses the button. */
export function tallyCounts(payload: TallyPayload, options: TallyOptions = {}): {
  vouchers: number;
  ledgers: number;
  leftOut: number;
  leftOutTotal: number;
} {
  const kinds = { ...ALL_KINDS, ...(options.kinds ?? {}) };
  const left = [
    ...payload.invoices.filter((i) => !i.accounted && wanted(i.type, kinds)),
    ...(kinds.payments ? payload.payments.filter((p) => !p.accounted) : []),
    ...(kinds.expenses ? payload.expenses.filter((e) => !e.accounted) : []),
  ];
  const xml = buildTallyXml(payload, options);
  return {
    vouchers: (xml.match(/<VOUCHER /g) ?? []).length,
    ledgers: (xml.match(/<LEDGER /g) ?? []).length,
    leftOut: left.length,
    leftOutTotal: left.reduce(
      (s, r) => s + ('grandTotal' in r ? r.grandTotal : r.amount),
      0,
    ),
  };
}

/** `tally_kannan-stores_2026-09-01_to_2026-09-30.xml` */
export function tallyFilename(payload: TallyPayload): string {
  const slug =
    payload.business.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'shop';
  return `tally_${slug}_${payload.from}_to_${payload.to}.xml`;
}
