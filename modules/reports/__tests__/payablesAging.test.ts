// Payables aging is the mirror of receivables: purchases are the charges, payments
// made and purchase returns settle the oldest first, and the buckets must add back
// to exactly what the ledger says the shop owes.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { buildAging, type AgeableInvoice } from '@/modules/reports/aging';
import type { Party } from '@/db/schema';

const TODAY = '2026-08-19';

const party = (id: number, type: Party['type'], openingBalance = 0): Party =>
  ({ id, name: `P${id}`, type, openingBalance, createdAt: '2026-01-01T00:00:00Z' }) as Party;

const inv = (partyId: number, type: string, date: string, grandTotal: number): AgeableInvoice =>
  ({ partyId, type, date, dueDate: null, grandTotal }) as unknown as AgeableInvoice;

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('payables aging', () => {
  const supplier = party(1, 'supplier');
  const invoices = [
    inv(1, 'purchase', '2026-07-20', 10000), // 30 days
    inv(1, 'purchase', '2026-06-20', 20000), // 60 days
    inv(1, 'purchase', '2026-05-11', 30000), // 100 days
    inv(1, 'purchaseReturn', '2026-07-01', 5000), // goods sent back: owe less
  ];

  it('ages what the shop owes, oldest settled first', () => {
    // Ledger: -60000 purchases + 5000 return + 25000 paid out = -30000 (owe ₹300).
    const report = buildAging([{ party: supplier, balance: -30000 }], invoices, TODAY, 'payable');
    expect(report.side).toBe('payable');
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0];
    // ₹300 settled eats the 100-day bill; the 60- and 30-day bills remain.
    expect(row.buckets).toEqual([10000, 20000, 0, 0]);
    expect(row.oldestDays).toBe(60);
    expect(row.total).toBe(30000);
  });

  it('buckets always add back to the ledger balance', () => {
    for (const owed of [1, 5000, 29999, 30000, 55000, 60000, 75000]) {
      const report = buildAging(
        [{ party: party(1, 'supplier', -10000), balance: -owed }],
        invoices,
        TODAY,
        'payable',
      );
      const row = report.rows[0];
      expect(sum(row.buckets)).toBe(owed);
      expect(row.total).toBe(owed);
      expect(sum(report.buckets)).toBe(report.total);
      expect(report.total).toBe(owed);
    }
  });

  it('counts a payable opening balance as the oldest money owed', () => {
    const report = buildAging(
      [{ party: party(2, 'supplier', -40000), balance: -40000 }],
      [],
      TODAY,
      'payable',
    );
    expect(report.rows[0].buckets[3]).toBe(40000);
  });

  it('keeps the two sides apart', () => {
    const customer = party(3, 'customer');
    const balances = [
      { party: supplier, balance: -30000 },
      { party: customer, balance: 12000 },
    ];
    const all = [...invoices, inv(3, 'sale', '2026-08-10', 12000)];
    const payable = buildAging(balances, all, TODAY, 'payable');
    const receivable = buildAging(balances, all, TODAY, 'receivable');
    expect(payable.rows.map((r) => r.party.id)).toEqual([1]);
    expect(receivable.rows.map((r) => r.party.id)).toEqual([3]);
    expect(receivable.total).toBe(12000);
    expect(receivable.buckets[0]).toBe(12000);
  });

  it('a supplier the shop has overpaid is not a payable', () => {
    const report = buildAging([{ party: supplier, balance: 500 }], invoices, TODAY, 'payable');
    expect(report.rows).toHaveLength(0);
    expect(report.total).toBe(0);
  });
});
