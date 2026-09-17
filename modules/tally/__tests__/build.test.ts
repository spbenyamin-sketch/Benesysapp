// The Tally file, checked the way an accountant would check it: does every
// voucher balance, does it say the same money the bill says, and is every name
// it mentions a ledger the same file creates?
//
// Everything here is pure — the builder never touches a database — so there is
// nothing to stub. Money is compared in whole paise, never in rupee strings.

import { buildTallyXml, tallyCounts, tallyFilename } from '@/modules/tally/build';
import type {
  TallyExpense,
  TallyInvoice,
  TallyParty,
  TallyPayload,
  TallyPayment,
} from '@/modules/tally/types';
import { computeTotals } from '@/utils/gst';

// ── Reading the file back ────────────────────────────────────────────────────

/** Each `<VOUCHER …>…</VOUCHER>` as its own string. */
function vouchers(xml: string): string[] {
  return [...xml.matchAll(/<VOUCHER [\s\S]*?<\/VOUCHER>/g)].map((m) => m[0]);
}

const paise = (rupeeText: string) => Math.round(parseFloat(rupeeText) * 100);

/** The ledger AMOUNTs of one voucher, in paise, without its bill allocations. */
function amounts(voucher: string): number[] {
  const withoutBills = voucher.replace(/<BILLALLOCATIONS\.LIST>[\s\S]*?<\/BILLALLOCATIONS\.LIST>/g, '');
  return [...withoutBills.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => paise(m[1]));
}

/** What one named ledger was posted in this voucher, in paise (signed). */
function posted(voucher: string, ledger: string): number {
  const entries = [...voucher.matchAll(/<ALLLEDGERENTRIES\.LIST>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/g)];
  const hit = entries.find((e) => e[1].includes(`<LEDGERNAME>${ledger}</LEDGERNAME>`));
  if (!hit) return 0;
  const amount = hit[1].replace(/<BILLALLOCATIONS\.LIST>[\s\S]*?<\/BILLALLOCATIONS\.LIST>/g, '')
    .match(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/);
  return amount ? paise(amount[1]) : 0;
}

const has = (xml: string, fragment: string) => xml.includes(fragment);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const party = (over: Partial<TallyParty> = {}): TallyParty => ({
  id: 1,
  name: 'Ravi Stores',
  type: 'customer',
  gstin: '33AAAAA0000A1Z5',
  state: 'Tamil Nadu',
  address: '12 Bazaar Street',
  city: 'Madurai',
  phone: '9876543210',
  ...over,
});

const invoice = (over: Partial<TallyInvoice> = {}): TallyInvoice => ({
  id: 1,
  type: 'sale',
  invoiceNo: 'INV/2026-27/001',
  date: '2026-09-15',
  partyId: 1,
  subtotal: 10000,
  taxTotal: 1800,
  discount: 0,
  roundOff: 0,
  grandTotal: 11800,
  placeOfSupply: 'Tamil Nadu',
  lines: [{ taxRate: 1800, amount: 10000 }],
  accounted: true,
  ...over,
});

const payment = (over: Partial<TallyPayment> = {}): TallyPayment => ({
  id: 7,
  partyId: 1,
  amount: 5000,
  mode: 'upi',
  direction: 'in',
  date: '2026-09-16',
  notes: null,
  accountName: 'Counter Cash',
  accountType: 'cash',
  invoiceNo: 'INV/2026-27/001',
  accounted: true,
  ...over,
});

const expense = (over: Partial<TallyExpense> = {}): TallyExpense => ({
  id: 3,
  category: 'Electricity',
  amount: 118000,
  taxRate: 1800,
  date: '2026-09-10',
  notes: null,
  accountName: null,
  accountType: null,
  accounted: true,
  ...over,
});

const payload = (over: Partial<TallyPayload> = {}): TallyPayload => ({
  from: '2026-09-01',
  to: '2026-09-30',
  business: { name: 'Kannan Stores', gstin: '33BBBBB1111B1Z5', state: 'Tamil Nadu' },
  parties: [party()],
  invoices: [invoice()],
  payments: [],
  expenses: [],
  ...over,
});

describe('every voucher balances', () => {
  // The one that matters: Tally refuses a voucher whose debits and credits
  // differ by a single paise, and says very little about why.
  it('holds for all six kinds at once', () => {
    const xml = buildTallyXml(
      payload({
        parties: [party(), party({ id: 2, name: 'Metro Traders', type: 'supplier' })],
        invoices: [
          invoice(),
          invoice({ id: 2, type: 'purchase', partyId: 2, invoiceNo: 'PUR/2026-27/001' }),
          invoice({
            id: 3,
            type: 'saleReturn',
            invoiceNo: 'CN/2026-27/001',
            sourceInvoiceNo: 'INV/2026-27/001',
            sourceDate: '2026-09-15',
          }),
          invoice({
            id: 4,
            type: 'purchaseReturn',
            partyId: 2,
            invoiceNo: 'DN/2026-27/001',
            sourceInvoiceNo: 'PUR/2026-27/001',
          }),
        ],
        payments: [payment(), payment({ id: 8, direction: 'out', partyId: 2, invoiceNo: null })],
        expenses: [expense()],
      }),
    );
    const all = vouchers(xml);
    expect(all).toHaveLength(7);
    for (const v of all) {
      expect(amounts(v).reduce((s, a) => s + a, 0)).toBe(0);
    }
  });

  it('holds with a bill discount and a round-off', () => {
    // 29970 + 5395 − 500 = 34865 → rounded to 34900, so roundOff is +35.
    const xml = buildTallyXml(
      payload({
        invoices: [
          invoice({
            subtotal: 29970,
            taxTotal: 5395,
            discount: 500,
            roundOff: 35,
            grandTotal: 34900,
            lines: [{ taxRate: 1800, amount: 29970 }],
          }),
        ],
      }),
    );
    const v = vouchers(xml)[0];
    expect(amounts(v).reduce((s, a) => s + a, 0)).toBe(0);
    // The discount came off the taxed total, so the slab is untouched by it.
    expect(posted(v, 'Sales @ 18%')).toBe(29970);
    expect(posted(v, 'Discount Allowed')).toBe(-500);
    expect(posted(v, 'Round Off')).toBe(35);
    expect(posted(v, 'Ravi Stores')).toBe(-34900);
  });

  it('puts a round-off the other way when the bill rounded down', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          invoices: [
            invoice({ subtotal: 10000, taxTotal: 1837, roundOff: -37, grandTotal: 11800 }),
          ],
        }),
      ),
    )[0];
    expect(posted(v, 'Round Off')).toBe(-37);
    expect(amounts(v).reduce((s, a) => s + a, 0)).toBe(0);
  });
});

describe('the money is the bill’s money', () => {
  // An inclusive-tax bill is where a re-derived taxable value would drift. The
  // builder must use what the app already computed, to the paise.
  it('matches computeTotals on an inclusive-rate bill', () => {
    const lines = [{ qty: 3000, rate: 11790, taxRate: 1800, discount: 0 }];
    const { lines: computed, totals } = computeTotals(lines, 0, 'inclusive');
    const v = vouchers(
      buildTallyXml(
        payload({
          invoices: [
            invoice({
              subtotal: totals.subtotal,
              taxTotal: totals.taxTotal,
              roundOff: totals.roundOff,
              grandTotal: totals.grandTotal,
              lines: computed.map((l) => ({ taxRate: 1800, amount: l.amount })),
            }),
          ],
        }),
      ),
    )[0];
    expect(posted(v, 'Sales @ 18%')).toBe(totals.subtotal);
    expect(posted(v, 'Output CGST') + posted(v, 'Output SGST')).toBe(totals.taxTotal);
    expect(posted(v, 'Ravi Stores')).toBe(-totals.grandTotal);
    expect(amounts(v).reduce((s, a) => s + a, 0)).toBe(0);
  });

  it('keeps each slab on its own ledger', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          invoices: [
            invoice({
              subtotal: 30000,
              taxTotal: 3900,
              grandTotal: 33900,
              lines: [
                { taxRate: 1800, amount: 20000 },
                { taxRate: 500, amount: 10000 },
              ],
            }),
          ],
        }),
      ),
    )[0];
    expect(posted(v, 'Sales @ 18%')).toBe(20000);
    expect(posted(v, 'Sales @ 5%')).toBe(10000);
  });
});

describe('which tax heads a supply attracts', () => {
  it('splits a local sale into CGST and SGST, the odd paise landing where splitTax puts it', () => {
    const v = vouchers(
      buildTallyXml(payload({ invoices: [invoice({ taxTotal: 5395, grandTotal: 15395 })] })),
    )[0];
    expect(posted(v, 'Output CGST')).toBe(2698);
    expect(posted(v, 'Output SGST')).toBe(2697);
    expect(posted(v, 'Output CGST') + posted(v, 'Output SGST')).toBe(5395);
    expect(v).not.toContain('Output IGST');
  });

  it('sends an out-of-state sale to IGST alone', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          parties: [party({ state: 'Kerala' })],
          invoices: [invoice({ placeOfSupply: 'Kerala' })],
        }),
      ),
    )[0];
    expect(posted(v, 'Output IGST')).toBe(1800);
    expect(v).not.toContain('Output CGST');
    expect(v).toContain('<PLACEOFSUPPLY>Kerala</PLACEOFSUPPLY>');
  });

  it('falls back to where the party lives when the bill never froze a place', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          parties: [party({ state: 'Kerala' })],
          invoices: [invoice({ placeOfSupply: null })],
        }),
      ),
    )[0];
    expect(v).toContain('<PLACEOFSUPPLY>Kerala</PLACEOFSUPPLY>');
    expect(posted(v, 'Output IGST')).toBe(1800);
  });

  it('buys under the input heads, not the output ones', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          parties: [party({ type: 'supplier' })],
          invoices: [invoice({ type: 'purchase', invoiceNo: 'PUR/1' })],
        }),
      ),
    )[0];
    expect(posted(v, 'Input CGST')).toBe(-900);
    expect(posted(v, 'Purchase @ 18%')).toBe(-10000);
    expect(posted(v, 'Ravi Stores')).toBe(11800);
  });
});

describe('returns', () => {
  it('raises a credit note against the bill it gives back', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          invoices: [
            invoice({
              type: 'saleReturn',
              invoiceNo: 'CN/1',
              sourceInvoiceNo: 'INV/2026-27/001',
              sourceDate: '2026-09-15',
            }),
          ],
        }),
      ),
    )[0];
    expect(v).toContain('VCHTYPE="Credit Note"');
    expect(v).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
    expect(v).toContain('<NAME>INV/2026-27/001</NAME>');
    expect(v).toContain('<REFERENCE>INV/2026-27/001</REFERENCE>');
    // Every side is the sale's, reversed.
    expect(posted(v, 'Ravi Stores')).toBe(11800);
    expect(posted(v, 'Sales @ 18%')).toBe(-10000);
  });

  // An Agst Ref naming a bill Tally never saw is refused, so goods that came
  // back without their bill open a reference of their own.
  it('opens its own reference when the original could not be found', () => {
    const v = vouchers(
      buildTallyXml(
        payload({ invoices: [invoice({ type: 'saleReturn', invoiceNo: 'CN/2', sourceInvoiceNo: null })] }),
      ),
    )[0];
    expect(v).toContain('<BILLTYPE>New Ref</BILLTYPE>');
    expect(v).toContain('<NAME>CN/2</NAME>');
  });

  it('raises a debit note on the buying side', () => {
    const v = vouchers(
      buildTallyXml(
        payload({
          parties: [party({ type: 'supplier' })],
          invoices: [invoice({ type: 'purchaseReturn', invoiceNo: 'DN/1' })],
        }),
      ),
    )[0];
    expect(v).toContain('VCHTYPE="Debit Note"');
    expect(posted(v, 'Ravi Stores')).toBe(-11800);
  });
});

describe('money in and out', () => {
  it('receives against the bill it was set against', () => {
    const v = vouchers(buildTallyXml(payload({ payments: [payment()] })))[1];
    expect(v).toContain('VCHTYPE="Receipt"');
    expect(posted(v, 'Counter Cash')).toBe(-5000);
    expect(posted(v, 'Ravi Stores')).toBe(5000);
    expect(v).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
    expect(v).toContain('<NARRATION>UPI</NARRATION>');
  });

  // On Account, not New Ref: a payment against no bill must not invent one.
  it('holds an unlinked payment on account', () => {
    const v = vouchers(buildTallyXml(payload({ payments: [payment({ invoiceNo: null })] })))[1];
    expect(v).toContain('<BILLTYPE>On Account</BILLTYPE>');
    expect(v).not.toContain('New Ref');
  });

  it('pays out through the mirror entries', () => {
    const v = vouchers(
      buildTallyXml(payload({ payments: [payment({ direction: 'out', mode: 'cash', accountName: null })] })),
    )[1];
    expect(v).toContain('VCHTYPE="Payment"');
    expect(posted(v, 'Cash')).toBe(5000);
    expect(posted(v, 'Ravi Stores')).toBe(-5000);
  });

  it('posts a card payment to the bank when no account was recorded', () => {
    const xml = buildTallyXml(payload({ payments: [payment({ mode: 'card', accountName: null })] }));
    expect(posted(vouchers(xml)[1], 'Bank')).toBe(-5000);
    expect(has(xml, '<LEDGER NAME="Bank"')).toBe(true);
  });
});

describe('expenses', () => {
  it('backs the GST out of a gross amount', () => {
    const v = vouchers(buildTallyXml(payload({ invoices: [], expenses: [expense()] })))[0];
    expect(posted(v, 'Electricity')).toBe(-100000);
    expect(posted(v, 'Input CGST')).toBe(-9000);
    expect(posted(v, 'Input SGST')).toBe(-9000);
    expect(posted(v, 'Cash')).toBe(118000);
    expect(amounts(v).reduce((s, a) => s + a, 0)).toBe(0);
  });

  it('writes two entries and no duty when the bill carried no GST', () => {
    const v = vouchers(
      buildTallyXml(payload({ invoices: [], expenses: [expense({ taxRate: 0, amount: 50000 })] })),
    )[0];
    expect(posted(v, 'Electricity')).toBe(-50000);
    expect(v).not.toContain('Input CGST');
    expect(amounts(v)).toHaveLength(2);
  });
});

describe('masters', () => {
  // The test that catches a ledger nobody remembered to create: Tally matches
  // by name, and a name with no master fails the import.
  it('creates every ledger any voucher mentions', () => {
    const xml = buildTallyXml(
      payload({
        parties: [party(), party({ id: 2, name: 'Metro Traders', type: 'supplier' })],
        invoices: [
          invoice({ discount: 500, roundOff: 35, grandTotal: 11335 }),
          invoice({ id: 2, type: 'purchase', partyId: 2, invoiceNo: 'PUR/1' }),
        ],
        payments: [payment()],
        expenses: [expense()],
      }),
    );
    const mentioned = new Set(
      [...xml.matchAll(/<LEDGERNAME>([^<]+)<\/LEDGERNAME>/g)].map((m) => m[1]),
    );
    expect(mentioned.size).toBeGreaterThan(5);
    for (const name of mentioned) {
      expect(has(xml, `<LEDGER NAME="${name}"`)).toBe(true);
    }
  });

  it('gives a party its group, its GSTIN and bill-wise tracking', () => {
    const xml = buildTallyXml(payload());
    expect(xml).toContain('<PARENT>Sundry Debtors</PARENT>');
    expect(xml).toContain('<PARTYGSTIN>33AAAAA0000A1Z5</PARTYGSTIN>');
    expect(xml).toContain('<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>');
    expect(xml).toContain('<ISBILLWISEON>Yes</ISBILLWISEON>');
  });

  it('calls a party with no GSTIN unregistered, and says nothing more', () => {
    const xml = buildTallyXml(payload({ parties: [party({ gstin: null })] }));
    expect(xml).toContain('<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>');
    expect(xml).not.toContain('<PARTYGSTIN>');
  });

  it('never sends an opening balance', () => {
    expect(buildTallyXml(payload())).not.toContain('OPENINGBALANCE');
  });

  it('writes only the parties the period actually used', () => {
    const xml = buildTallyXml(
      payload({ parties: [party(), party({ id: 9, name: 'Never Traded' })] }),
    );
    expect(xml).not.toContain('Never Traded');
  });

  it('marks a GST ledger as a duty ledger', () => {
    const xml = buildTallyXml(payload());
    expect(xml).toContain('<GSTDUTYHEAD>Central Tax</GSTDUTYHEAD>');
    expect(xml).toContain('<PARENT>Duties &amp; Taxes</PARENT>');
  });

  it('leaves them all out when the shop asks for vouchers only', () => {
    const xml = buildTallyXml(payload(), { masters: false });
    expect(xml).not.toContain('<LEDGER ');
    expect(vouchers(xml)).toHaveLength(1);
  });
});

describe('what is left out', () => {
  it('never writes a row that is not in the books', () => {
    const xml = buildTallyXml(
      payload({
        invoices: [invoice({ accounted: false })],
        payments: [payment({ accounted: false })],
        expenses: [expense({ accounted: false })],
      }),
    );
    expect(vouchers(xml)).toHaveLength(0);
    // ...nor the ledgers those rows would have needed.
    expect(xml).not.toContain('Ravi Stores');
  });

  it('honours the kinds the shop ticked', () => {
    const xml = buildTallyXml(
      payload({ payments: [payment()], expenses: [expense()] }),
      { kinds: { payments: false, expenses: false } },
    );
    expect(vouchers(xml)).toHaveLength(1);
  });

  it('counts what is going and what is not', () => {
    const counts = tallyCounts(
      payload({
        invoices: [invoice(), invoice({ id: 2, accounted: false, grandTotal: 25000 })],
        payments: [payment()],
      }),
    );
    expect(counts.vouchers).toBe(2);
    expect(counts.leftOut).toBe(1);
    expect(counts.leftOutTotal).toBe(25000);
    expect(counts.ledgers).toBeGreaterThan(0);
  });
});

describe('the file itself', () => {
  it('is an Import Data envelope', () => {
    const xml = buildTallyXml(payload());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<REPORTNAME>Vouchers</REPORTNAME>');
    // Naming the company here would silently import nothing when it is wrong.
    expect(xml).not.toContain('SVCURRENTCOMPANY');
  });

  it('survives a name with markup in it, and writes Tamil as ASCII', () => {
    const xml = buildTallyXml(
      payload({ parties: [party({ name: 'R&D "Traders" <Ltd>' })], expenses: [expense({ category: 'அரிசி' })] }),
    );
    expect(xml).toContain('R&amp;D &quot;Traders&quot; &lt;Ltd&gt;');
    expect([...xml].every((ch) => (ch.codePointAt(0) ?? 0) < 127)).toBe(true);
    expect(xml).toContain('&#2949;'); // அ
  });

  it('writes dates the way Tally reads them', () => {
    expect(buildTallyXml(payload())).toContain('<DATE>20260915</DATE>');
  });

  it('carries a stable id so a second import knows the same voucher', () => {
    expect(buildTallyXml(payload())).toContain('<REMOTEID>benesys-inv-1</REMOTEID>');
  });

  it('names the file after the shop and the period', () => {
    expect(tallyFilename(payload())).toBe('tally_kannan-stores_2026-09-01_to_2026-09-30.xml');
  });

  it('is still a valid envelope when there is nothing to send', () => {
    const xml = buildTallyXml(payload({ invoices: [] }));
    expect(xml).toContain('<REQUESTDATA></REQUESTDATA>');
    expect(vouchers(xml)).toHaveLength(0);
  });
});
