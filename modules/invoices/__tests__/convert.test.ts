// Converting a quotation is the one place where `source_invoice_id` has to
// carry two different meanings at once: a converted sale points back at the
// quotation it came from, a credit note points back at the bill it gives back.
// These pin the two apart — and pin the thing that is easy to get wrong and
// impossible to notice, that the sale freezes TODAY's cost rather than the cost
// the quotation was written with.
//
// db/client is a small in-memory stand-in rather than a recorder: `where` is
// read back off drizzle's own condition object, so every query really does
// filter the rows it asked for. Without that, each select from `invoices` would
// answer the same list and the two meanings could not be told apart at all.

jest.mock('@/db/client', () => {
  const { invoiceItems, invoices, items, parties } = require('@/db/schema');

  const state = {
    invoices: [] as any[],
    invoiceItems: [] as any[],
    items: [] as any[],
    parties: [] as any[],
    /** Every write made inside a transaction, in order. */
    ops: [] as { op: string; table: string }[],
    nextId: 100,
  };

  const tableName = (t: unknown) =>
    t === invoices ? 'invoices' : t === invoiceItems ? 'invoiceItems' : t === items ? 'items' : 'other';
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

  // Column names come back in SQL spelling; the rows are the app's own shape.
  const camel = (s: string) => s.replace(/_(\w)/g, (_m: string, c: string) => c.toUpperCase());
  const isColumn = (c: any) => c && typeof c.name === 'string' && c.table !== undefined;
  const isParam = (c: any) => c && typeof c === 'object' && !Array.isArray(c) && 'encoder' in c;

  /** Only `eq`, `inArray` and `and` are ever asked of this store. */
  const matches = (cond: any, row: any): boolean => {
    const chunks = cond?.queryChunks;
    if (!chunks) return true;
    const nested = chunks.filter((c: any) => c?.queryChunks); // and(a, b)
    if (nested.length) return nested.every((c: any) => matches(c, row));
    const column = chunks.find(isColumn);
    if (!column) return true;
    const cell = row[camel(column.name)];
    const list = chunks.find((c: any) => Array.isArray(c)); // inArray
    if (list) return list.map((p: any) => (isParam(p) ? p.value : p)).includes(cell);
    const param = chunks.find(isParam);
    return cell === (param ? param.value : undefined);
  };

  const result = (list: any[]) => Object.assign([...list], { orderBy: () => [...list] });

  const tx = {
    insert: (t: unknown) => ({
      values: (values: any) => {
        const row = { id: state.nextId++, ...values };
        rowsOf(t).push(row);
        state.ops.push({ op: 'insert', table: tableName(t) });
        // Statements inside a transaction are executed with .all() — see db/atomic.
        return { returning: () => ({ all: () => [row] }), all: () => [] };
      },
    }),
    update: (t: unknown) => ({
      set: () => ({
        where: () => ({ all: () => (state.ops.push({ op: 'update', table: tableName(t) }), []) }),
      }),
    }),
    delete: (t: unknown) => ({
      where: () => ({ all: () => (state.ops.push({ op: 'delete', table: tableName(t) }), []) }),
    }),
  };

  return {
    __state: state,
    db: {
      select: () => ({
        from: (t: unknown) => {
          const base = rowsOf(t);
          const all = result(base);
          (all as any).where = (cond: any) => result(base.filter((r) => matches(cond, r)));
          return all;
        },
      }),
      transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    },
    sqlite: {},
  };
});

import {
  convertToInvoice,
  convertedFrom,
  returnedTotal,
  returnsAgainst,
  sourceDocument,
} from '@/modules/invoices/service';

const state = (require('@/db/client') as { __state: any }).__state;

const today = () => new Date().toISOString().slice(0, 10);

// A quotation written last month: two units of sugar at ₹100, ₹5 off the bill.
// The cost frozen on it (₹40) is last month's — sugar costs ₹70 today.
const quotation = () => ({
  id: 1,
  type: 'quotation',
  invoiceNo: 'QTN/2026-27/001',
  partyId: 5,
  date: '2026-07-01',
  subtotal: 20000,
  taxTotal: 0,
  discount: 500,
  roundOff: 0,
  grandTotal: 19500,
  paymentStatus: 'unpaid',
  dueDate: null,
  placeOfSupply: 'Kerala',
  sourceInvoiceId: null,
  taxMode: 'exclusive',
});

beforeEach(() => {
  state.invoices = [quotation()];
  state.invoiceItems = [
    {
      id: 1,
      invoiceId: 1,
      itemId: 3,
      qty: 2000,
      rate: 10000,
      taxRate: 0,
      amount: 20000,
      costPrice: 4000,
      discount: 0,
      hsnCode: '1701',
    },
  ];
  state.items = [{ id: 3, name: 'Sugar', purchasePrice: 7000, hsnCode: '1701', currentStock: 50000 }];
  state.parties = [{ id: 5, name: 'Rajesh', state: 'Tamil Nadu' }];
  state.ops = [];
  state.nextId = 100;
});

describe('turning a quotation into a bill', () => {
  it('writes a new sale with its own number, pointing back at the quotation', async () => {
    const bill = await convertToInvoice(1);
    expect(bill.type).toBe('sale');
    expect(bill.invoiceNo).toMatch(/^INV\//);
    expect(bill.sourceInvoiceId).toBe(1);
  });

  it('carries over what was agreed with the customer', async () => {
    const bill = await convertToInvoice(1);
    expect(bill).toMatchObject({
      partyId: 5,
      taxMode: 'exclusive',
      discount: 500,
      // Priced for where the goods were going, not for where the party lives.
      placeOfSupply: 'Kerala',
    });
    expect(state.invoiceItems.find((l: any) => l.invoiceId === bill.id)).toMatchObject({
      itemId: 3,
      qty: 2000,
      rate: 10000,
      taxRate: 0,
    });
  });

  it('dates the bill today — the goods move now, not when it was quoted', async () => {
    const bill = await convertToInvoice(1);
    expect(bill.date).toBe(today());
    expect(bill.date).not.toBe('2026-07-01');
    expect(bill.dueDate).toBeNull();
  });

  it('freezes what the goods cost TODAY, not what the quotation carried', async () => {
    const bill = await convertToInvoice(1);
    const line = state.invoiceItems.find((l: any) => l.invoiceId === bill.id);
    expect(line.costPrice).toBe(7000);
    expect(line.costPrice).not.toBe(4000);
  });

  it('takes the goods off the shelf, in the same transaction as the bill', async () => {
    await convertToInvoice(1);
    expect(state.ops).toEqual([
      { op: 'insert', table: 'invoices' },
      { op: 'insert', table: 'invoiceItems' },
      { op: 'update', table: 'items' },
    ]);
  });

  it('leaves the quotation alone — it is the record of what was promised', async () => {
    await convertToInvoice(1);
    expect(state.invoices.find((i: any) => i.id === 1)).toMatchObject({ type: 'quotation' });
  });
});

describe('what cannot be converted', () => {
  it('refuses a sale', async () => {
    state.invoices = [{ ...quotation(), id: 2, type: 'sale', invoiceNo: 'INV/2026-27/001' }];
    await expect(convertToInvoice(2)).rejects.toThrow(/quotation or a delivery challan/);
  });

  it('refuses a credit note', async () => {
    state.invoices = [{ ...quotation(), id: 3, type: 'saleReturn', invoiceNo: 'CN/2026-27/001' }];
    await expect(convertToInvoice(3)).rejects.toThrow(/quotation or a delivery challan/);
  });

  it('refuses a second time, and names the bill it already became', async () => {
    const first = await convertToInvoice(1);
    await expect(convertToInvoice(1)).rejects.toThrow(first.invoiceNo);
    // Nothing was written on the refused attempt — the shelf is only emptied once.
    expect(state.invoices.filter((i: any) => i.type === 'sale')).toHaveLength(1);
  });
});

describe('the two meanings of source_invoice_id', () => {
  // One sale, with a credit note against it AND a quotation that became it.
  beforeEach(() => {
    state.invoices = [
      quotation(),
      { ...quotation(), id: 7, type: 'sale', invoiceNo: 'INV/2026-27/007', sourceInvoiceId: 1 },
      { ...quotation(), id: 9, type: 'saleReturn', invoiceNo: 'CN/2026-27/001', sourceInvoiceId: 7, grandTotal: 2000 },
      { ...quotation(), id: 8, type: 'sale', invoiceNo: 'INV/2026-27/008', sourceInvoiceId: 7, grandTotal: 50000 },
    ];
  });

  it('counts only the credit note as a return, never a bill converted from it', async () => {
    expect((await returnsAgainst(7)).map((r) => r.id)).toEqual([9]);
    expect(await returnedTotal(7)).toBe(2000);
  });

  it('finds the bill a quotation became', async () => {
    expect((await convertedFrom(1))?.id).toBe(7);
  });

  it('lets a sale name the quotation it came from', async () => {
    const sale = state.invoices.find((i: any) => i.id === 7);
    expect((await sourceDocument(sale))?.invoiceNo).toBe('QTN/2026-27/001');
  });

  it('does not mistake the bill a credit note reverses for a quotation', async () => {
    const note = state.invoices.find((i: any) => i.id === 9);
    expect(await sourceDocument(note)).toBeUndefined();
  });
});
