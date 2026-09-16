// A paid bill used to refuse to delete: `payments.invoice_id` is a real foreign
// key with no cascade, so SQLite rejected the delete outright and the shop was
// shown "FOREIGN KEY constraint failed". These pin the fix — the receipt goes
// inside the same transaction as the bill, before it — without needing a real
// database: db/client is a recorder that remembers the order of the writes.

jest.mock('@/db/client', () => {
  const { invoiceItems, invoices, items, payments } = require('@/db/schema');
  const state = {
    invoice: { id: 7, type: 'sale', grandTotal: 15000 },
    lines: [{ id: 1, invoiceId: 7, itemId: 3, qty: 1000 }],
    payments: [{ id: 11, invoiceId: 7, amount: 15000 }],
    returns: [],
    ops: [] as { op: string; table: string }[],
  };
  const name = (t: unknown) =>
    t === invoices ? 'invoices' : t === invoiceItems ? 'invoiceItems' : t === payments ? 'payments' : t === items ? 'items' : 'other';
  const rows = (t: unknown) => {
    const base =
      t === invoices ? [state.invoice] : t === invoiceItems ? state.lines : t === payments ? state.payments : [];
    return Object.assign([...base], { orderBy: () => state.returns });
  };
  const record = (op: string, t: unknown) => state.ops.push({ op, table: name(t) });
  // Statements inside a transaction are executed with .all() — see db/atomic.
  const tx = {
    update: (t: unknown) => ({ set: () => ({ where: () => ({ all: () => (record('update', t), []) }) }) }),
    delete: (t: unknown) => ({ where: () => ({ all: () => (record('delete', t), []) }) }),
  };
  return {
    __state: state,
    db: {
      select: () => ({ from: (t: unknown) => ({ where: () => rows(t) }) }),
      transaction: (cb: (t: typeof tx) => void) => cb(tx),
    },
    sqlite: {},
  };
});

import { deleteInvoiceWithItems, deletionImpact } from '@/modules/invoices/service';

const state = (require('@/db/client') as { __state: any }).__state;

beforeEach(() => {
  state.invoice = { id: 7, type: 'sale', grandTotal: 15000 };
  state.lines = [{ id: 1, invoiceId: 7, itemId: 3, qty: 1000 }];
  state.payments = [{ id: 11, invoiceId: 7, amount: 15000 }];
  state.returns = [];
  state.ops = [];
});

describe('deleting a paid bill', () => {
  it('clears the payments pointing at it before deleting the bill', async () => {
    await deleteInvoiceWithItems(7);
    const deletes = state.ops.filter((o: any) => o.op === 'delete').map((o: any) => o.table);
    expect(deletes).toEqual(['payments', 'invoices']);
  });

  it('still puts the stock back', async () => {
    await deleteInvoiceWithItems(7);
    expect(state.ops[0]).toEqual({ op: 'update', table: 'items' });
  });

  it('does the whole thing in one transaction', async () => {
    // The recorder only ever sees writes made through `tx` — if any of them had
    // been issued on `db` directly this would come back short.
    await deleteInvoiceWithItems(7);
    expect(state.ops).toHaveLength(3);
  });
});

describe('what the confirmation is told', () => {
  it('counts the money that will go with the bill', async () => {
    state.payments = [
      { id: 11, invoiceId: 7, amount: 10000 },
      { id: 12, invoiceId: 7, amount: 5000 },
    ];
    const impact = await deletionImpact(7);
    expect(impact).toMatchObject({ paymentCount: 2, paymentTotal: 15000 });
  });

  it('counts the return notes that will be left naming nothing', async () => {
    state.returns = [{ id: 9, type: 'saleReturn', sourceInvoiceId: 7 }];
    expect((await deletionImpact(7)).returnCount).toBe(1);
  });

  it('says nothing extra for an unpaid bill with no returns', async () => {
    state.payments = [];
    expect(await deletionImpact(7)).toEqual({ paymentCount: 0, paymentTotal: 0, returnCount: 0 });
  });
});
