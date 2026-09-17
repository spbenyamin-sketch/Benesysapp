// The split must never change what a report says in total: whatever the shop
// has marked, accounted + nonAccounted is the same number the screen already
// showed. Everything here is pure, so no database is stubbed.

import { accountedNote, splitAccounted } from '@/modules/reports/accounted';

const bill = (grandTotal: number, accounted = true) => ({ grandTotal, accounted });
const total = (b: { grandTotal: number }) => b.grandTotal;

describe('splitAccounted', () => {
  it('keeps the two halves adding up to the report total', () => {
    const rows = [bill(10000), bill(25000, false), bill(5000)];
    const split = splitAccounted(rows, total);
    expect(split.accounted).toBe(15000);
    expect(split.nonAccounted).toBe(25000);
    expect(split.total).toBe(40000);
    expect(split.accountedCount).toBe(2);
    expect(split.nonAccountedCount).toBe(1);
  });

  // A credit note against an off-books sale is off-books too; netting it on the
  // wrong side would make the accountant's half look smaller than it is.
  it('nets a return off its own side of the split', () => {
    const rows = [bill(10000), bill(25000, false)];
    const returns = [bill(4000), bill(5000, false)];
    const split = splitAccounted(rows, total, returns);
    expect(split.accounted).toBe(6000);
    expect(split.nonAccounted).toBe(20000);
    expect(split.total).toBe(26000);
  });

  it('does not count a return as another document', () => {
    const split = splitAccounted([bill(10000)], total, [bill(1000, false)]);
    expect(split.accountedCount).toBe(1);
    expect(split.nonAccountedCount).toBe(0);
  });

  it('is all zeros for an empty range', () => {
    expect(splitAccounted([], total)).toEqual({
      accounted: 0,
      nonAccounted: 0,
      total: 0,
      accountedCount: 0,
      nonAccountedCount: 0,
    });
  });
});

describe('accountedNote', () => {
  // The normal day: the shop marked nothing, so the report says nothing.
  it('is silent when everything is in the books', () => {
    expect(accountedNote(splitAccounted([bill(10000)], total), 'bill')).toBe('');
  });

  it('names the money, the count and what the accountant will see', () => {
    const split = splitAccounted([bill(10000), bill(25000, false)], total);
    expect(accountedNote(split, 'bill')).toBe(
      "₹250.00 across 1 bill is not in the books — your accountant's copy shows ₹100.00.",
    );
  });

  it('says "bills" when there is more than one', () => {
    const split = splitAccounted([bill(1000, false), bill(2000, false)], total);
    expect(accountedNote(split, 'bill')).toContain('2 bills');
  });
});
