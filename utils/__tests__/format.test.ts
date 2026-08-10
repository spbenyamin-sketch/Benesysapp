import {
  balanceSummary,
  formatDate,
  formatMoney,
  formatQty,
  formatTaxRate,
  paiseToRupeeInput,
  parseQtyToThousandths,
  parseRupeesToPaise,
  parseTaxRateToBasisPoints,
  qtyToInput,
  taxRateToInput,
} from '@/utils/format';

// The UI is the only layer allowed to turn stored integers into strings and back.
// A parse bug here silently books the wrong amount, so the round trips matter.

describe('formatMoney', () => {
  it('groups rupees the Indian way', () => {
    expect(formatMoney(100)).toBe('₹1.00');
    expect(formatMoney(123456700)).toBe('₹12,34,567.00');
    expect(formatMoney(100000)).toBe('₹1,000.00');
  });

  it('always shows two paise digits', () => {
    expect(formatMoney(5)).toBe('₹0.05');
    expect(formatMoney(150)).toBe('₹1.50');
  });

  it('keeps a leading minus on a payable', () => {
    expect(formatMoney(-2500)).toBe('-₹25.00');
  });

  it('renders zero as ₹0.00', () => {
    expect(formatMoney(0)).toBe('₹0.00');
  });
});

describe('parseRupeesToPaise', () => {
  it('accepts what a user actually types', () => {
    expect(parseRupeesToPaise('1500')).toBe(150000);
    expect(parseRupeesToPaise('1,500')).toBe(150000);
    expect(parseRupeesToPaise('₹99')).toBe(9900);
    expect(parseRupeesToPaise('1500.50')).toBe(150050);
  });

  it('falls back to zero on blank or junk input', () => {
    expect(parseRupeesToPaise('')).toBe(0);
    expect(parseRupeesToPaise('   ')).toBe(0);
    expect(parseRupeesToPaise('abc')).toBe(0);
    expect(parseRupeesToPaise('.')).toBe(0);
  });

  it('rounds to whole paise rather than storing a float', () => {
    expect(parseRupeesToPaise('10.005')).toBe(1001);
    expect(Number.isInteger(parseRupeesToPaise('0.1'))).toBe(true);
  });

  it('round-trips through the edit field', () => {
    for (const paise of [0, 5, 100, 150050, 123456700]) {
      const typed = paiseToRupeeInput(paise);
      expect(parseRupeesToPaise(typed)).toBe(paise);
    }
  });
});

describe('formatDate', () => {
  it('renders an ISO day', () => {
    expect(formatDate('2026-07-05')).toBe('5 Jul 2026');
  });

  it('accepts a full timestamp and uses its date part', () => {
    expect(formatDate('2026-01-31T18:30:00.000Z')).toBe('31 Jan 2026');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('balanceSummary', () => {
  it('reads a positive balance as money to collect', () => {
    expect(balanceSummary(5000).label).toBe('To collect');
  });

  it('reads a negative balance as money to pay', () => {
    expect(balanceSummary(-5000).label).toBe('To pay');
  });

  it('reads zero as settled', () => {
    expect(balanceSummary(0).label).toBe('Settled');
  });
});

describe('quantity helpers', () => {
  it('trims trailing zeros on display', () => {
    expect(formatQty(2500)).toBe('2.5');
    expect(formatQty(10000)).toBe('10');
  });

  it('parses fractional quantities to thousandths', () => {
    expect(parseQtyToThousandths('2.5')).toBe(2500);
    expect(parseQtyToThousandths('')).toBe(0);
    expect(parseQtyToThousandths('abc')).toBe(0);
  });

  it('round-trips through the edit field', () => {
    for (const q of [0, 250, 1000, 2500, 12345]) {
      expect(parseQtyToThousandths(qtyToInput(q))).toBe(q);
    }
  });
});

describe('tax rate helpers', () => {
  it('shows basis points as a percentage', () => {
    expect(formatTaxRate(1800)).toBe('18%');
    expect(formatTaxRate(250)).toBe('2.5%');
    expect(formatTaxRate(0)).toBe('0%');
  });

  it('parses a typed percentage to basis points', () => {
    expect(parseTaxRateToBasisPoints('18')).toBe(1800);
    expect(parseTaxRateToBasisPoints('2.5')).toBe(250);
    expect(parseTaxRateToBasisPoints('')).toBe(0);
  });

  it('round-trips through the edit field', () => {
    for (const bp of [0, 250, 500, 1200, 1800, 2800]) {
      expect(parseTaxRateToBasisPoints(taxRateToInput(bp))).toBe(bp);
    }
  });
});
