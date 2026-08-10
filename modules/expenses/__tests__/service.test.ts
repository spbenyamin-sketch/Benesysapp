import type { Expense } from '@/db/schema';

// The DB calls are exercised on-device; what is worth pinning here is the money
// derivation: an expense amount is the GROSS bill total, so the GST shown must be
// backed OUT of it and the category totals must add back up to that same total.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { expenseTax, filterExpensesByRange, summariseExpenses } from '@/modules/expenses/service';

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    category: 'Rent',
    amount: 100000,
    taxRate: 0,
    date: '2026-08-01',
    notes: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

describe('expenseTax', () => {
  it('backs GST out of the gross amount', () => {
    expect(expenseTax({ amount: 11800, taxRate: 1800 })).toEqual({ amount: 10000, tax: 1800 });
  });

  it('reports no tax on an untaxed expense', () => {
    expect(expenseTax({ amount: 50000, taxRate: 0 })).toEqual({ amount: 50000, tax: 0 });
  });
});

describe('summariseExpenses', () => {
  it('returns zeros for no expenses', () => {
    expect(summariseExpenses([])).toEqual({
      total: 0,
      taxable: 0,
      tax: 0,
      count: 0,
      byCategory: [],
    });
  });

  it('totals the gross amounts and the GST inside them', () => {
    const rows = [
      expense({ id: 1, amount: 11800, taxRate: 1800 }),
      expense({ id: 2, amount: 50000, taxRate: 0 }),
    ];
    const s = summariseExpenses(rows);
    expect(s.total).toBe(61800);
    expect(s.tax).toBe(1800);
    expect(s.taxable).toBe(60000);
    expect(s.count).toBe(2);
  });

  it('keeps taxable + tax equal to the total', () => {
    const rows = [
      expense({ id: 1, amount: 9999, taxRate: 1800 }),
      expense({ id: 2, amount: 3333, taxRate: 500 }),
      expense({ id: 3, amount: 777, taxRate: 1200 }),
    ];
    const s = summariseExpenses(rows);
    expect(s.taxable + s.tax).toBe(s.total);
  });

  it('groups by category, biggest spend first', () => {
    const rows = [
      expense({ id: 1, category: 'Rent', amount: 100000 }),
      expense({ id: 2, category: 'Fuel', amount: 30000 }),
      expense({ id: 3, category: 'Fuel', amount: 20000 }),
      expense({ id: 4, category: 'Electricity', amount: 40000 }),
    ];
    expect(summariseExpenses(rows).byCategory).toEqual([
      { category: 'Rent', total: 100000, count: 1 },
      { category: 'Fuel', total: 50000, count: 2 },
      { category: 'Electricity', total: 40000, count: 1 },
    ]);
  });

  it('category totals add back up to the grand total', () => {
    const rows = [
      expense({ id: 1, category: 'Rent', amount: 100000 }),
      expense({ id: 2, category: 'Fuel', amount: 30000 }),
      expense({ id: 3, category: 'Fuel', amount: 20000 }),
    ];
    const s = summariseExpenses(rows);
    expect(s.byCategory.reduce((sum, c) => sum + c.total, 0)).toBe(s.total);
  });
});

describe('filterExpensesByRange', () => {
  const rows = [
    expense({ id: 1, date: '2026-07-31' }),
    expense({ id: 2, date: '2026-08-01' }),
    expense({ id: 3, date: '2026-08-31' }),
    expense({ id: 4, date: '2026-09-01' }),
  ];

  it('includes both bounds', () => {
    const kept = filterExpensesByRange(rows, '2026-08-01', '2026-08-31');
    expect(kept.map((r) => r.id)).toEqual([2, 3]);
  });

  it('returns nothing for an empty window', () => {
    expect(filterExpensesByRange(rows, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});
