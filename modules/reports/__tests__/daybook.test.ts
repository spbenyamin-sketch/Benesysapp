// db/client is stubbed so the module loads in plain Node. What is pinned here is
// the one rule that makes a day book trustworthy: a bill on credit appears on
// the page but is NOT money, so the day's cash can never be overstated.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { orderDayBook, summariseDayBook, type DayBookEntry } from '@/modules/reports/daybook';

const entry = (over: Partial<DayBookEntry> = {}): DayBookEntry => ({
  key: 'k',
  kind: 'sale',
  title: 'INV-1',
  sub: 'Rajesh',
  amount: 10000,
  cash: false,
  ...over,
});

describe('summariseDayBook', () => {
  it('counts only what actually moved as cash', () => {
    const s = summariseDayBook([
      entry({ key: 'a', kind: 'sale', amount: 50000 }), // on credit
      entry({ key: 'b', kind: 'paymentIn', amount: 20000, cash: true }),
      entry({ key: 'c', kind: 'paymentOut', amount: 5000, cash: true }),
      entry({ key: 'd', kind: 'expense', amount: 3000, cash: true }),
    ]);
    expect(s.cashIn).toBe(20000);
    expect(s.cashOut).toBe(8000); // paid out + expenses
    expect(s.netCash).toBe(12000);
    // The ₹500 sale is on the page, but the shop did not receive it today.
    expect(s.salesBilled).toBe(50000);
  });

  it('keeps billed figures whole, credit and cash alike', () => {
    const s = summariseDayBook([
      entry({ key: 'a', kind: 'sale', amount: 10000 }),
      entry({ key: 'b', kind: 'sale', amount: 25000 }),
      entry({ key: 'c', kind: 'saleReturn', amount: 4000 }),
      entry({ key: 'd', kind: 'purchase', amount: 60000 }),
    ]);
    expect(s.salesBilled).toBe(35000);
    expect(s.returnsBilled).toBe(4000);
    expect(s.purchasesBilled).toBe(60000);
    expect(s.netCash).toBe(0);
  });

  it('reads a day of only spending as cash going out', () => {
    const s = summariseDayBook([entry({ kind: 'expense', amount: 150000, cash: true })]);
    expect(s.cashIn).toBe(0);
    expect(s.netCash).toBe(-150000);
  });

  it('gives a quiet day all zeroes', () => {
    expect(summariseDayBook([])).toEqual({
      cashIn: 0,
      cashOut: 0,
      netCash: 0,
      salesBilled: 0,
      returnsBilled: 0,
      purchasesBilled: 0,
      expenses: 0,
    });
  });
});

describe('orderDayBook', () => {
  it('reads bills first, then the money, biggest first within each', () => {
    const ordered = orderDayBook([
      entry({ key: 'exp', kind: 'expense', amount: 1000 }),
      entry({ key: 'pin-small', kind: 'paymentIn', amount: 2000 }),
      entry({ key: 'sale', kind: 'sale', amount: 5000 }),
      entry({ key: 'pin-big', kind: 'paymentIn', amount: 9000 }),
      entry({ key: 'purchase', kind: 'purchase', amount: 7000 }),
    ]);
    expect(ordered.map((e) => e.key)).toEqual([
      'sale',
      'purchase',
      'pin-big',
      'pin-small',
      'exp',
    ]);
  });
});
