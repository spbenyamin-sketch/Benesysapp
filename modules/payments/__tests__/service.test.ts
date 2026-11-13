// Editing a payment must leave every bill it touches with the right paid status:
// the one it was against before AND the one it is against now. db/client is a
// tiny in-memory fake — `eq` is mocked to a plain {column, value} pair so the
// fake can tell which rows a query means.

jest.mock('drizzle-orm', () => ({
  ...jest.requireActual('drizzle-orm'),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

jest.mock('@/db/client', () => {
  const schema = require('@/db/schema');
  const state: Record<string, any[]> = { invoices: [], parties: [], payments: [] };
  const tableName = (t: unknown) =>
    t === schema.invoices ? 'invoices' : t === schema.parties ? 'parties' : 'payments';
  // Which JS key of the row a drizzle column object stands for.
  const keyOf = (t: unknown, column: unknown) =>
    Object.keys(t as object).find((k) => (t as any)[k] === column) as string;
  const match = (t: unknown, cond: { column: unknown; value: unknown }) => (row: any) =>
    row[keyOf(t, cond.column)] === cond.value;
  return {
    __state: state,
    sqlite: {},
    db: {
      select: () => ({
        from: (t: unknown) => ({
          // Copies, as a real driver returns — a later update must not reach back into them.
          where: (cond: any) => state[tableName(t)].filter(match(t, cond)).map((r) => ({ ...r })),
        }),
      }),
      update: (t: unknown) => ({
        set: (data: object) => ({
          where: (cond: any) => {
            const hit = state[tableName(t)].filter(match(t, cond));
            hit.forEach((row) => Object.assign(row, data));
            return Object.assign(Promise.resolve(), { returning: async () => hit.map((r) => ({ ...r })) });
          },
        }),
      }),
    },
  };
});

import {
  amountMatchesTerm,
  invoicesToRefresh,
  searchPayments,
  updatePayment,
} from '@/modules/payments/service';

const state = (require('@/db/client') as { __state: Record<string, any[]> }).__state;

beforeEach(() => {
  state.parties = [{ id: 1, type: 'customer', name: 'Ravi' }];
  state.invoices = [
    { id: 7, partyId: 1, type: 'sale', grandTotal: 50000, paymentStatus: 'paid' },
    { id: 8, partyId: 1, type: 'sale', grandTotal: 50000, paymentStatus: 'unpaid' },
  ];
  state.payments = [
    {
      id: 11,
      partyId: 1,
      invoiceId: 7,
      amount: 50000,
      direction: 'in',
      mode: 'cash',
      accountId: 3,
      accounted: false,
    },
  ];
});

describe('updatePayment', () => {
  it('moving a payment to another bill frees the old one and settles the new one', async () => {
    await updatePayment(11, { invoiceId: 8 });
    expect(state.invoices.find((i) => i.id === 7)!.paymentStatus).toBe('unpaid');
    expect(state.invoices.find((i) => i.id === 8)!.paymentStatus).toBe('paid');
  });

  it('shrinking the amount turns the bill partial', async () => {
    await updatePayment(11, { amount: 20000 });
    expect(state.invoices.find((i) => i.id === 7)!.paymentStatus).toBe('partial');
  });

  it('turning it on-account frees the bill it was against', async () => {
    await updatePayment(11, { invoiceId: null });
    expect(state.invoices.find((i) => i.id === 7)!.paymentStatus).toBe('unpaid');
  });

  it('leaves the fields it was not given alone', async () => {
    const row = await updatePayment(11, { amount: 30000 });
    expect(row).toMatchObject({ direction: 'in', accountId: 3, accounted: false, invoiceId: 7 });
  });
});

describe('invoicesToRefresh', () => {
  it('lists the old and new bill once each', () => {
    expect(invoicesToRefresh(7, 8)).toEqual([7, 8]);
    expect(invoicesToRefresh(7, 7)).toEqual([7]);
    expect(invoicesToRefresh(null, 8)).toEqual([8]);
    expect(invoicesToRefresh(7, null)).toEqual([7]);
    expect(invoicesToRefresh(undefined, null)).toEqual([]);
  });
});

describe('searchPayments', () => {
  const rows = [
    { id: 1, amount: 50000, partyName: 'Ravi Stores', notes: 'advance', invoiceNo: 'INV-12', mode: 'cash' as const },
    { id: 2, amount: 150000, partyName: 'Kumar Traders', notes: null, invoiceNo: null, mode: 'upi' as const },
    { id: 3, amount: 50050, partyName: 'Selvi', notes: null, invoiceNo: 'INV-30', mode: 'bank' as const },
  ];
  const ids = (q: string) => searchPayments(rows, q).map((r) => r.id);

  it('returns everything for a blank query', () => {
    expect(ids('  ')).toEqual([1, 2, 3]);
  });

  it('matches party, note, bill number and mode, ignoring case', () => {
    expect(ids('ravi')).toEqual([1]);
    expect(ids('ADVANCE')).toEqual([1]);
    expect(ids('inv-30')).toEqual([3]);
    expect(ids('upi')).toEqual([2]);
  });

  it('matches amounts in rupees from the front', () => {
    expect(ids('500')).toEqual([1, 3]);
    expect(ids('1,500')).toEqual([2]);
    expect(ids('₹500.5')).toEqual([3]);
  });

  it('needs every word to match', () => {
    expect(ids('ravi 500')).toEqual([1]);
    expect(ids('kumar 500')).toEqual([]);
  });
});

describe('amountMatchesTerm', () => {
  it('ignores words that are not numbers', () => {
    expect(amountMatchesTerm(50000, 'five')).toBe(false);
    expect(amountMatchesTerm(50000, '5')).toBe(true);
  });
});
