// The 58mm receipt is the paper the shop hands over every day, so what is pinned
// here is what a customer must be able to read off it: the total, the right tax
// heads for the bill's own place of supply, a QR only when money is still owed,
// and a party name that cannot break the page.
//
// thermalHtml is pure, so the test only has to keep the module loadable in plain
// Node: db/client and the native print/share/file modules are stubbed away, and
// nothing below ever reaches them.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));
jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-image-picker', () => ({}));

import { thermalHtml, type ThermalBill } from '@/modules/invoices/thermal';
import type { InvoiceDetail } from '@/modules/invoices/service';
import type { BusinessProfile } from '@/modules/settings/service';

const biz = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
  name: 'Benesys Stores',
  state: 'Tamil Nadu',
  ...over,
});

// One line of 10 units at ₹100 with 18% GST added on top: taxable ₹1,000,
// tax ₹180, bill ₹1,180.
const detail = (over: Partial<InvoiceDetail['invoice']> = {}, party = 'Rajesh'): InvoiceDetail =>
  ({
    invoice: {
      id: 1,
      type: 'sale',
      invoiceNo: 'INV-1',
      partyId: 2,
      date: '2026-08-20',
      subtotal: 100000,
      taxTotal: 18000,
      discount: 0,
      grandTotal: 118000,
      paymentStatus: 'unpaid',
      placeOfSupply: 'Tamil Nadu',
      roundOff: 0,
      taxMode: 'exclusive',
      ...over,
    },
    party: { id: 2, name: party, state: 'Tamil Nadu' },
    lines: [
      {
        id: 1,
        invoiceId: 1,
        itemId: 3,
        qty: 10000,
        rate: 10000,
        taxRate: 1800,
        amount: 100000,
        discount: 0,
        itemName: 'Tea Powder',
        itemUnit: 'kg',
      },
    ],
  }) as unknown as InvoiceDetail;

const build = (over: Partial<ThermalBill> = {}): string =>
  thermalHtml({ detail: detail(), biz: biz(), ...over });

describe('the 58mm receipt', () => {
  it('prints on a 58mm roll, not a sheet', () => {
    expect(build()).toContain('@page { size: 58mm auto; margin: 0; }');
  });

  it('carries the grand total the invoice was saved with', () => {
    const html = build();
    expect(html).toContain('₹1,180.00');
    expect(html).toContain('TOTAL');
  });

  it('shows the item, its qty × rate and its amount', () => {
    const html = build();
    expect(html).toContain('Tea Powder');
    expect(html).toContain('10 kg × ₹100.00');
  });
});

describe('the tax heads follow the bill, not the shop', () => {
  it('splits an in-state bill into CGST and SGST', () => {
    const html = build();
    expect(html).toContain('CGST 9%');
    expect(html).toContain('SGST 9%');
    expect(html).not.toContain('IGST');
    // The two halves add back to the invoice's own tax figure.
    expect(html.match(/₹90\.00/g)).toHaveLength(2);
  });

  it('prints IGST alone when the goods crossed a state line', () => {
    const html = thermalHtml({
      detail: detail({ placeOfSupply: 'Kerala' }),
      biz: biz(),
    });
    expect(html).toContain('IGST 18%');
    expect(html).toContain('₹180.00');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
  });

  it('respects the frozen place of supply even if the party has since moved', () => {
    const moved = detail({ placeOfSupply: 'Kerala' });
    moved.party = { ...moved.party, state: 'Tamil Nadu' } as InvoiceDetail['party'];
    expect(thermalHtml({ detail: moved, biz: biz() })).toContain('IGST');
  });
});

describe('the scan-to-pay code', () => {
  it('is printed on a sale the shop is still owed', () => {
    const html = build({ biz: biz({ upiId: 'shop@okaxis' }) });
    expect(html).toContain('<svg');
    expect(html).toContain('Scan to pay ₹1,180.00');
  });

  it('is left off a bill already settled — a QR there invites a second payment', () => {
    const html = thermalHtml({
      detail: detail({ paymentStatus: 'paid' }),
      biz: biz({ upiId: 'shop@okaxis' }),
    });
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('Scan to pay');
  });

  it('carries no amount on a part-paid bill, and shows what is left', () => {
    const html = thermalHtml({
      detail: detail({ paymentStatus: 'partial' }),
      biz: biz({ upiId: 'shop@okaxis' }),
      paid: 18000,
    });
    expect(html).toContain('Scan to pay the balance');
    expect(html).toContain('Balance due');
    expect(html).toContain('₹1,000.00'); // 1,180 billed − 180 paid
  });
});

describe('what goes on the paper is escaped', () => {
  it('cannot be broken by a party called "Raj & Co <Chennai>"', () => {
    const html = thermalHtml({ detail: detail({}, 'Raj & Co <Chennai>'), biz: biz() });
    expect(html).toContain('Raj &amp; Co &lt;Chennai&gt;');
    expect(html).not.toContain('<Chennai>');
  });
});
