// Profit is the number a shopkeeper trusts the app for, so the arithmetic under
// it is pinned here: cost comes from the snapshot taken at billing time, the
// fallback for older lines is visible rather than silent, and a sale below cost
// shows as a loss instead of being clamped away.
//
// db/client is stubbed so the module loads in plain Node — these functions are
// pure and never touch it.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { marginPercent, summariseProfitLines, type ProfitLine } from '@/modules/reports/service';

const line = (over: Partial<ProfitLine> = {}): ProfitLine => ({
  itemId: 1,
  name: 'Chicken',
  unit: 'kg',
  qty: 1000, // 1 unit
  amount: 20000, // ₹200 pre-tax
  costPrice: 15000, // ₹150/unit
  itemPurchasePrice: 18000, // today's price — must NOT be used when a snapshot exists
  ...over,
});

describe('summariseProfitLines', () => {
  test('uses the cost frozen on the line, not the item price of today', () => {
    const { items, saleValue, costValue } = summariseProfitLines([line()]);
    expect(saleValue).toBe(20000);
    expect(costValue).toBe(15000);
    expect(items[0].profit).toBe(5000);
  });

  test('scales the cost by the quantity sold', () => {
    // 1.5 kg @ ₹150 cost = ₹225.
    const { costValue, items } = summariseProfitLines([line({ qty: 1500, amount: 30000 })]);
    expect(costValue).toBe(22500);
    expect(items[0].qty).toBe(1500);
  });

  test('falls back to the item price for lines billed before costs were recorded', () => {
    const { costValue, estimatedLines } = summariseProfitLines([line({ costPrice: null })]);
    expect(costValue).toBe(18000);
    expect(estimatedLines).toBe(1);
  });

  test('counts lines that have no cost at all — they read as pure profit', () => {
    const { zeroCostLines, items } = summariseProfitLines([
      line({ costPrice: null, itemPurchasePrice: 0 }),
    ]);
    expect(zeroCostLines).toBe(1);
    expect(items[0].profit).toBe(20000);
  });

  test('groups the same item across bills and sorts by profit', () => {
    const { items } = summariseProfitLines([
      line(),
      line({ qty: 2000, amount: 40000 }),
      line({ itemId: 2, name: 'Tea', unit: 'pcs', qty: 3000, amount: 3000, costPrice: 500 }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('Chicken');
    expect(items[0].qty).toBe(3000);
    expect(items[0].saleValue).toBe(60000);
    expect(items[0].costValue).toBe(45000);
    expect(items[0].profit).toBe(15000);
    expect(items[1].profit).toBe(1500);
  });

  test('a returned line takes its value and its cost back out', () => {
    // Sold 2 kg, one came back: 1 kg's worth of profit should survive.
    const { items, saleValue, costValue } = summariseProfitLines([
      line({ qty: 2000, amount: 40000 }),
      line({ qty: -1000, amount: -20000 }), // the credit note, negated by profitReport
    ]);
    expect(saleValue).toBe(20000);
    expect(costValue).toBe(15000);
    expect(items).toHaveLength(1);
    expect(items[0].profit).toBe(5000);
    expect(items[0].qty).toBe(1000);
  });

  test('a sale below cost is a loss, not a zero', () => {
    const { items } = summariseProfitLines([line({ amount: 10000 })]);
    expect(items[0].profit).toBe(-5000);
  });

  test('no sales → all zeros', () => {
    expect(summariseProfitLines([])).toEqual({
      items: [],
      saleValue: 0,
      costValue: 0,
      estimatedLines: 0,
      zeroCostLines: 0,
    });
  });
});

describe('marginPercent', () => {
  test('one decimal place', () => {
    expect(marginPercent(5000, 20000)).toBe(25);
    expect(marginPercent(1234, 10000)).toBe(12.3);
  });

  test('a loss is negative, and nothing sold is 0 rather than a divide by zero', () => {
    expect(marginPercent(-5000, 20000)).toBe(-25);
    expect(marginPercent(0, 0)).toBe(0);
  });
});
