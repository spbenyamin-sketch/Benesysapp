import {
  cappedLineDiscount,
  computeLine,
  computeTotals,
  discountFromPercent,
  lineAmount,
  lineTax,
  roundToRupee,
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
    expect(totals.roundOff).toBe(35); // ₹353.65 → ₹354.00
    expect(totals.grandTotal).toBe(35400);
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
    expect(totals).toEqual({ subtotal: 0, taxTotal: 0, discount: 0, roundOff: 0, grandTotal: 0 });
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

// ── Round off ────────────────────────────────────────────────────────────────
// Nobody at a counter hands over 65 paise. The bill is landed on a whole rupee
// and the difference is carried openly, so the printed rows still add up.

describe('roundToRupee', () => {
  it('goes to the nearest rupee, half a rupee upwards', () => {
    expect(roundToRupee(35365)).toBe(35400);
    expect(roundToRupee(11020)).toBe(11000);
    expect(roundToRupee(10050)).toBe(10100);
    expect(roundToRupee(10000)).toBe(10000);
  });
});

describe('computeTotals round off', () => {
  it('always reconciles: subtotal + tax − discount + roundOff === grand total', () => {
    const cases: Array<[Parameters<typeof computeTotals>[0], number]> = [
      [[{ qty: 3000, rate: 9990, taxRate: 1800 }], 0],
      [[{ qty: 1000, rate: 4999, taxRate: 500 }], 137],
      [[{ qty: 777, rate: 333, taxRate: 1200 }], 0],
      [[{ qty: 2500, rate: 12345, taxRate: 2800 }], 5000],
    ];
    for (const [lines, discount] of cases) {
      const { totals } = computeTotals(lines, discount);
      expect(totals.subtotal + totals.taxTotal - totals.discount + totals.roundOff).toBe(
        totals.grandTotal,
      );
      expect(totals.grandTotal % 100).toBe(0); // a whole number of rupees
      expect(Math.abs(totals.roundOff)).toBeLessThanOrEqual(50);
    }
  });

  it('leaves an already-whole total alone', () => {
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }]);
    expect(totals.grandTotal).toBe(11800);
    expect(totals.roundOff).toBe(0);
  });

  it('does not round a bill that a discount wiped out', () => {
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }], 99999);
    expect(totals.grandTotal).toBe(0);
    expect(totals.roundOff).toBe(0);
  });
});

// ── Line-level discount ──────────────────────────────────────────────────────
// Money taken off ONE item. It comes off before the tax, because GST is charged
// on what actually changed hands, not on the price that was crossed out.

describe('cappedLineDiscount', () => {
  it('never goes negative and never exceeds the line', () => {
    expect(cappedLineDiscount(500, 10000)).toBe(500);
    expect(cappedLineDiscount(-500, 10000)).toBe(0);
    expect(cappedLineDiscount(99999, 10000)).toBe(10000);
    expect(cappedLineDiscount(undefined, 10000)).toBe(0);
  });
});

describe('computeLine with a discount', () => {
  it('taxes what is left after the discount, not the full rate', () => {
    // ₹100 line, ₹20 off, 18% → tax on ₹80.
    const line = computeLine({ qty: 1000, rate: 10000, taxRate: 1800, discount: 2000 });
    expect(line).toMatchObject({ discount: 2000, amount: 8000, tax: 1440, gross: 9440 });
  });

  it('carves the tax out of the discounted price in inclusive mode', () => {
    // ₹118 counter price, ₹18 off → ₹100 changed hands, ₹15.25 of it is tax.
    const line = computeLine({ qty: 1000, rate: 11800, taxRate: 1800, discount: 1800 }, 'inclusive');
    expect(line.discount).toBe(1800);
    expect(line.amount + line.tax).toBe(10000);
    expect(line.gross).toBe(10000);
  });

  it('cannot be discounted past free', () => {
    const line = computeLine({ qty: 1000, rate: 10000, taxRate: 1800, discount: 50000 });
    expect(line).toMatchObject({ discount: 10000, amount: 0, tax: 0, gross: 0 });
  });

  it('leaves an undiscounted line exactly as before', () => {
    expect(computeLine({ qty: 1000, rate: 10000, taxRate: 1800 })).toMatchObject({
      discount: 0,
      amount: 10000,
      tax: 1800,
    });
  });
});

describe('computeTotals with line discounts', () => {
  it('rolls the discounted amounts into the subtotal', () => {
    const { lines: computed, totals } = computeTotals([
      { qty: 1000, rate: 10000, taxRate: 1800, discount: 2000 }, // ₹80 + ₹14.40
      { qty: 1000, rate: 5000, taxRate: 0, discount: 500 }, // ₹45, untaxed
    ]);
    expect(computed[0].amount).toBe(8000);
    expect(computed[1].amount).toBe(4500);
    expect(totals.subtotal).toBe(12500);
    expect(totals.taxTotal).toBe(1440);
    expect(totals.grandTotal).toBe(13900); // ₹139.40 → ₹139.00
    expect(totals.roundOff).toBe(-40);
  });

  it('stacks with the bill-level discount, which comes off after tax', () => {
    const { totals } = computeTotals(
      [{ qty: 1000, rate: 10000, taxRate: 1800, discount: 2000 }],
      440,
    );
    expect(totals.discount).toBe(440);
    expect(totals.grandTotal).toBe(9000); // 8000 + 1440 − 440 = 9000 exactly
  });
});

// ── Percentage discounts ─────────────────────────────────────────────────────
// A shop says "ten percent off" as readily as "fifty rupees off". The percentage
// is what was agreed and what the bill has to print, but PAISE are what the bill
// is made of — so what these pin down is the conversion, and that a percentage
// can never do anything a rupee figure could not already do.

describe('discountFromPercent', () => {
  it('turns basis points into paise', () => {
    expect(discountFromPercent(100000, 1000)).toBe(10000); // 10% of ₹1,000
    expect(discountFromPercent(11800, 250)).toBe(295); // 2.5% of ₹118
  });

  it('lands on a whole paisa instead of carrying a fraction into the totals', () => {
    expect(discountFromPercent(9999, 1000)).toBe(1000); // 10% of ₹99.99 = 999.9p
    expect(discountFromPercent(105, 700)).toBe(7); // 7% of ₹1.05 = 7.35p
  });

  it('never hands money back', () => {
    expect(discountFromPercent(10000, -500)).toBe(0);
    expect(discountFromPercent(-10000, 1000)).toBe(0);
  });
});

describe('a bill-level percentage', () => {
  it('comes off the taxed total — what the customer would otherwise have paid', () => {
    // ₹100 + 18% = ₹118; 10% of that is ₹11.80, leaving ₹106.20 → ₹106.
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }], 0, 'exclusive', 1000);
    expect(totals.discount).toBe(1180);
    expect(totals.grandTotal).toBe(10600);
  });

  it('decides the money, so a rupee figure handed in beside it is ignored', () => {
    const { totals } = computeTotals(
      [{ qty: 1000, rate: 10000, taxRate: 1800 }],
      5000,
      'exclusive',
      1000,
    );
    expect(totals.discount).toBe(1180);
  });

  it('gives the whole bill away at 100%', () => {
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }], 0, 'exclusive', 10000);
    expect(totals.discount).toBe(11800);
    expect(totals.grandTotal).toBe(0);
    expect(totals.roundOff).toBe(0);
  });

  it('still reconciles: subtotal + tax − discount + roundOff === grand total', () => {
    const { totals } = computeTotals([{ qty: 3000, rate: 9990, taxRate: 1800 }], 0, 'exclusive', 733);
    expect(totals.subtotal + totals.taxTotal - totals.discount + totals.roundOff).toBe(
      totals.grandTotal,
    );
    expect(totals.grandTotal % 100).toBe(0);
  });

  it('leaves the rupee path untouched when no percentage was typed', () => {
    const { totals } = computeTotals([{ qty: 1000, rate: 10000, taxRate: 1800 }], 800, 'exclusive', null);
    expect(totals.discount).toBe(800);
  });
});

describe('a line-level percentage', () => {
  it('comes off before tax, so the tax follows the money that changed hands', () => {
    // ₹100 line, 20% off → ₹80 taxable, 18% of that is ₹14.40.
    const line = computeLine({ qty: 1000, rate: 10000, taxRate: 1800, discountPercent: 2000 });
    expect(line).toMatchObject({ discount: 2000, amount: 8000, tax: 1440, gross: 9440 });
  });

  it('is capped by the line, exactly as a rupee figure is', () => {
    const line = computeLine({ qty: 1000, rate: 10000, taxRate: 1800, discountPercent: 15000 });
    expect(line).toMatchObject({ discount: 10000, amount: 0, tax: 0, gross: 0 });
  });

  it('gives the item away at 100%', () => {
    const line = computeLine({ qty: 2000, rate: 5000, taxRate: 1800, discountPercent: 10000 });
    expect(line).toMatchObject({ discount: 10000, amount: 0, tax: 0 });
  });

  it('carves the tax out of what is left, in inclusive mode', () => {
    // ₹118 counter price, 10% off → ₹106.20 changed hands, tax carved out of it.
    const line = computeLine(
      { qty: 1000, rate: 11800, taxRate: 1800, discountPercent: 1000 },
      'inclusive',
    );
    expect(line.discount).toBe(1180);
    expect(line.gross).toBe(10620);
    expect(line.amount + line.tax).toBe(10620);
  });

  it('decides the money; a null percentage leaves the rupee figure in charge', () => {
    const base = { qty: 1000, rate: 10000, taxRate: 0, discount: 500 };
    expect(computeLine({ ...base, discountPercent: 2000 }).discount).toBe(2000);
    expect(computeLine({ ...base, discountPercent: null }).discount).toBe(500);
  });

  it('rolls into the subtotal alongside lines discounted in rupees', () => {
    const { totals } = computeTotals([
      { qty: 1000, rate: 10000, taxRate: 1800, discountPercent: 2000 }, // ₹80
      { qty: 1000, rate: 5000, taxRate: 0, discount: 500 }, // ₹45
    ]);
    expect(totals.subtotal).toBe(12500);
  });
});
