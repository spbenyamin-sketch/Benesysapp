// A discount can now be typed as "10%", and the percentage is STORED so that a
// reprint years later still says 10%. What matters is that the percentage never
// becomes the money: the paise are worked out once, at billing time, and those
// paise are what every total and every report is built from. These pin that —
// the percentage lands in its own column, the money lands in `discount`, and a
// discount typed in rupees still stores NULL, exactly as every existing row has.
//
// db/client is a small in-memory stand-in: enough of drizzle for the create path
// to read its prices and write its rows.
jest.mock('@/db/client', () => {
  const { invoiceItems, invoices, items, parties } = require('@/db/schema');

  const state = {
    invoices: [] as any[],
    invoiceItems: [] as any[],
    items: [] as any[],
    parties: [] as any[],
    nextId: 100,
  };

  const rowsOf = (t: unknown) =>
    t === invoices
      ? state.invoices
      : t === invoiceItems
        ? state.invoiceItems
        : t === items
          ? state.items
          : t === parties
            ? state.parties
            : [];

  const result = (list: any[]) =>
    Object.assign([...list], { orderBy: () => [...list], where: () => result(list) });

  const tx = {
    insert: (t: unknown) => ({
      values: (values: any) => {
        const row = { id: state.nextId++, ...values };
        rowsOf(t).push(row);
        // Statements inside a transaction are executed with .all() — see db/atomic.
        return { returning: () => ({ all: () => [row] }), all: () => [] };
      },
    }),
    update: () => ({ set: () => ({ where: () => ({ all: () => [] }) }) }),
    delete: () => ({ where: () => ({ all: () => [] }) }),
  };

  return {
    __state: state,
    db: {
      select: () => ({ from: (t: unknown) => result(rowsOf(t)) }),
      transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    },
    sqlite: {},
  };
});

import { createInvoiceWithItems } from '@/modules/invoices/service';

const state = (require('@/db/client') as { __state: any }).__state;

// One item at ₹100 with 18% GST: a bill of one unit is ₹118 before any discount.
beforeEach(() => {
  state.invoices = [];
  state.invoiceItems = [];
  state.items = [{ id: 3, name: 'Tea', purchasePrice: 7000, hsnCode: '0902', currentStock: 50000 }];
  state.parties = [{ id: 5, name: 'Rajesh', state: 'Tamil Nadu' }];
  state.nextId = 100;
});

const header = { type: 'sale' as const, partyId: 5, date: '2026-09-16' };
const line = { itemId: 3, qty: 1000, rate: 10000, taxRate: 1800 };

const savedLine = (invoiceId: number) =>
  state.invoiceItems.find((l: any) => l.invoiceId === invoiceId);

describe('a bill discount typed as a percentage', () => {
  it('stores the percentage AND the paise it came to', async () => {
    const bill = await createInvoiceWithItems({ ...header, discountPercent: 1000 }, [line]);
    expect(bill.discountPercent).toBe(1000);
    expect(bill.discount).toBe(1180); // 10% of ₹118
    expect(bill.grandTotal).toBe(10600); // ₹106.20 → ₹106
  });

  it('stores NULL when the shop typed rupees, as every older bill does', async () => {
    const bill = await createInvoiceWithItems({ ...header, discount: 800 }, [line]);
    expect(bill.discountPercent).toBeNull();
    expect(bill.discount).toBe(800);
  });

  it('does not claim 0% was given away on a bill with no discount at all', async () => {
    const bill = await createInvoiceWithItems({ ...header, discountPercent: 0 }, [line]);
    expect(bill.discountPercent).toBeNull();
    expect(bill.discount).toBe(0);
  });
});

describe('a line discount typed as a percentage', () => {
  it('stores the percentage beside the paise that came off the line', async () => {
    const bill = await createInvoiceWithItems(header, [{ ...line, discountPercent: 2000 }]);
    expect(savedLine(bill.id)).toMatchObject({ discount: 2000, discountPercent: 2000 });
    expect(bill.subtotal).toBe(8000); // ₹100 less 20%
  });

  it('keeps the percentage even where the money had to be capped at the line', async () => {
    // 150% of a ₹100 line: the line can only be given away once.
    const bill = await createInvoiceWithItems(header, [{ ...line, discountPercent: 15000 }]);
    expect(savedLine(bill.id)).toMatchObject({ discount: 10000, discountPercent: 15000 });
    expect(bill.subtotal).toBe(0);
    expect(bill.grandTotal).toBe(0);
  });

  it('stores NULL on a line discounted in rupees', async () => {
    const bill = await createInvoiceWithItems(header, [{ ...line, discount: 2000 }]);
    expect(savedLine(bill.id)).toMatchObject({ discount: 2000, discountPercent: null });
  });
});
