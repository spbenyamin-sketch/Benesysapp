import {
  computeLine,
  computeTotals,
  lineAmount,
  lineTax,
  splitInclusive,
} from '@/utils/gst';

// Everything here is integer paise / thousandths / basis points (see db/schema.ts).
// The point of these tests is the plan's "No Error" rule: no float drift, and the
// customer-facing total always reconciles with the stored taxable + tax split.

describe('lineAmount', () => {
  it('multiplies a thousandths qty by a paise rate', () => {
    expect(lineAmount(1000, 100)).toBe(100); // 1 unit @ ₹1.00
    expect(lineAmount(2500, 4000)).toBe(10000); // 2.5 units @ ₹40.00 = ₹100.00
  });

  it('rounds a fractional paise result instead of truncating it', () => {
    // 0.333 units @ ₹1.00 = 33.3 paise → 33
    expect(lineAmount(333, 100)).toBe(33);
    // 0.335 units @ ₹1.00 = 33.5 paise → 34
    expect(lineAmount(335, 100)).toBe(34);
  });
});

describe('lineTax', () => {
  it('applies a basis-point rate to a paise amount', () => {
    expect(lineTax(10000, 1800)).toBe(1800); // ₹100 @ 18% = ₹18
    expect(lineTax(10000, 250)).toBe(250); // ₹100 @ 2.5% = ₹2.50
  });

  it('returns zero for an untaxed line', () => {
    expect(lineTax(12345, 0)).toBe(0);
  });
});

describe('splitInclusive', () => {
  it('backs the tax out of a tax-inclusive price', () => {
    expect(splitInclusive(11800, 1800)).toEqual({ amount: 10000, tax: 1800 });
  });

  it('never leaks a paise: taxable + tax always equals the gross', () => {
    for (const gross of [1, 7, 99, 100, 4999, 35370, 123457]) {
      for (const rate of [0, 250, 500, 1200, 1800, 2800]) {
        const { amount, tax } = splitInclusive(gross, rate);
        expect(amount + tax).toBe(gross);
      }
    }
  });

  it('treats a zero rate as all-taxable', () => {
    expect(splitInclusive(5000, 0)).toEqual({ amount: 5000, tax: 0 });
  });
});

describe('computeLine', () => {
  it('adds tax on top in exclusive mode', () => {
    const line = computeLine({ qty: 1000, rate: 10000, taxRate: 1800 }, 'exclusive');
    expect(line).toMatchObject({ amount: 10000, tax: 1800, gross: 11800 });
  });

  it('splits tax out of the rate in inclusive mode', () => {
    const line = computeLine({ qty: 1000, rate: 11800, taxRate: 1800 }, 'inclusive');
    expect(line).toMatchObject({ amount: 10000, tax: 1800, gross: 11800 });
  });

  it('defaults to exclusive when no mode is given', () => {
    expect(computeLine({ qty: 1000, rate: 10000, taxRate: 1800 })).toMatchObject({
      amount: 10000,
      tax: 1800,
    });
  });
});

describe('computeTotals', () => {
  // The repeating-decimal case the execution plan calls out by name:
  // 3 units @ ₹99.90, 18% GST.
  it('holds exact through an 18% repeating-decimal line', () => {
    const { totals } = computeTotals([{ qty: 3000, rate: 9990, taxRate: 1800 }]);
    expect(totals.subtotal).toBe(29970); // ₹299.70
    expect(totals.taxTotal).toBe(5395); // ₹53.95 (5394.6 rounded)
    expect(totals.grandTotal).toBe(35365); // ₹353.65
    expect(Number.isInteger(totals.grandTotal)).toBe(true);
  });

  it('keeps the inclusive total identical to what was keyed in', () => {
    const { totals } = computeTotals([{ qty: 3000, rate: 11790, taxRate: 1800 }], 0, 'inclusive');
    expect(totals.subtotal + totals.taxTotal).toBe(35370);
  });

  it('sums mixed tax slabs line by line', () => {
    const { totals } = computeTotals([
      { qty: 1000, rate: 10000, taxRate: 1800 }, // ₹100 + ₹18
      { qty: 2000, rate: 5000, taxRate: 500 }, // ₹100 + ₹5
      { qty: 1000, rate: 25000, taxRate: 0 }, // ₹250 + ₹0
    ]);
    expect(totals.subtotal).toBe(45000);
    expect(totals.taxTotal).toBe(2300);
    expect(totals.grandTotal).toBe(47300);
  });

  it('subtracts a flat discount after tax', () => {
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }], 800);
    expect(totals.discount).toBe(800);
    expect(totals.grandTotal).toBe(11000);
  });

  it('floors an over-large discount at zero instead of going negative', () => {
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }], 99999);
    expect(totals.grandTotal).toBe(0);
  });

  it('returns zero totals for an empty invoice', () => {
    const { totals } = computeTotals([]);
    expect(totals).toEqual({ subtotal: 0, taxTotal: 0, discount: 0, grandTotal: 0 });
  });

  it('rounds each line independently, so lines and totals reconcile', () => {
    const lines = [
      { qty: 333, rate: 999, taxRate: 1800 },
      { qty: 777, rate: 333, taxRate: 1200 },
    ];
    const { lines: computed, totals } = computeTotals(lines);
    expect(totals.subtotal).toBe(computed.reduce((s, l) => s + l.amount, 0));
    expect(totals.taxTotal).toBe(computed.reduce((s, l) => s + l.tax, 0));
  });
});
