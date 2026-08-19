// db/client is stubbed so the report module loads in plain Node — the roll-ups
// below are pure, and they are what the shopkeeper reads as "what sells".
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import {
  percentOf,
  summariseItemSales,
  summarisePartyTotals,
  type ItemSaleLine,
} from '@/modules/reports/service';
import type { InvoiceWithParty } from '@/modules/invoices/service';

const line = (over: Partial<ItemSaleLine> = {}): ItemSaleLine => ({
  itemId: 1,
  name: 'Tea',
  unit: 'pcs',
  invoiceId: 100,
  qty: 1000,
  amount: 1000,
  ...over,
});

describe('summariseItemSales', () => {
  it('adds a repeated item up across bills and counts the bills once each', () => {
    const rows = summariseItemSales([
      line({ invoiceId: 1, qty: 2000, amount: 2000 }),
      line({ invoiceId: 2, qty: 3000, amount: 3000 }),
      // Same item twice on one bill still only puts that bill in the count once.
      line({ invoiceId: 2, qty: 1000, amount: 1000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 6000, saleValue: 6000, bills: 2 });
  });

  it('nets a return off the item it came back from', () => {
    // Sold 10, two came back → 8 sold, and the value follows.
    const rows = summariseItemSales([
      line({ qty: 10000, amount: 10000 }),
      line({ invoiceId: 200, qty: -2000, amount: -2000 }),
    ]);
    expect(rows[0].qty).toBe(8000);
    expect(rows[0].saleValue).toBe(8000);
  });

  it('ranks by value, biggest first', () => {
    const rows = summariseItemSales([
      line({ itemId: 1, name: 'Tea', amount: 1000 }),
      line({ itemId: 2, name: 'Sugar', amount: 5000 }),
      line({ itemId: 3, name: 'Rice', amount: 3000 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Sugar', 'Rice', 'Tea']);
  });

  it('keeps an item whose returns wiped it out, rather than hiding the fact', () => {
    const rows = summariseItemSales([
      line({ qty: 2000, amount: 2000 }),
      line({ invoiceId: 2, qty: -2000, amount: -2000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 0, saleValue: 0, bills: 2 });
  });

  it('has nothing to say about an empty period', () => {
    expect(summariseItemSales([])).toEqual([]);
  });
});

const bill = (over: Partial<InvoiceWithParty> = {}) =>
  ({
    id: 1,
    type: 'purchase',
    invoiceNo: 'PUR-1',
    partyId: 7,
    partyName: 'Kumar Traders',
    date: '2026-08-01',
    subtotal: 10000,
    taxTotal: 1800,
    discount: 0,
    roundOff: 0,
    grandTotal: 11800,
    paymentStatus: 'unpaid',
    taxMode: 'exclusive',
    dueDate: null,
    placeOfSupply: null,
    sourceInvoiceId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }) as InvoiceWithParty;

describe('summarisePartyTotals', () => {
  it('groups bills by party, biggest spend first', () => {
    const rows = summarisePartyTotals([
      bill({ id: 1, partyId: 7, partyName: 'Kumar', grandTotal: 10000 }),
      bill({ id: 2, partyId: 8, partyName: 'Devi', grandTotal: 50000 }),
      bill({ id: 3, partyId: 7, partyName: 'Kumar', grandTotal: 30000 }),
    ]);
    expect(rows).toEqual([
      { partyId: 8, partyName: 'Devi', count: 1, total: 50000 },
      { partyId: 7, partyName: 'Kumar', count: 2, total: 40000 },
    ]);
  });
});

describe('percentOf', () => {
  it('gives one decimal place', () => {
    expect(percentOf(50000, 200000)).toBe(25);
    expect(percentOf(1, 3)).toBe(33.3);
  });

  it('is zero rather than infinite when there is no whole', () => {
    expect(percentOf(500, 0)).toBe(0);
  });
});
