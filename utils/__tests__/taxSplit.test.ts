import { splitTax, splitTaxForStates, supplyType } from '@/utils/gst';

// The CGST/SGST/IGST split is purely a printing concern — the invoice stores one
// tax figure. The rule these tests protect: whatever is printed must add back to
// that figure exactly, so no bill ever shows a paise that came from nowhere.

describe('supplyType', () => {
  it('reads the same state as intra-state', () => {
    expect(supplyType('Tamil Nadu', 'Tamil Nadu')).toBe('intra');
  });

  it('reads two different states as inter-state', () => {
    expect(supplyType('Tamil Nadu', 'Kerala')).toBe('inter');
  });

  it('compares trimmed and case-insensitively', () => {
    expect(supplyType('  tamil nadu ', 'TAMIL NADU')).toBe('intra');
    expect(supplyType('Tamil Nadu', '  kerala')).toBe('inter');
  });

  it('falls back to intra-state when either state is missing or blank', () => {
    expect(supplyType(null, 'Kerala')).toBe('intra');
    expect(supplyType('Tamil Nadu', null)).toBe('intra');
    expect(supplyType(undefined, undefined)).toBe('intra');
    expect(supplyType('', 'Kerala')).toBe('intra');
    expect(supplyType('Tamil Nadu', '   ')).toBe('intra');
  });
});

describe('splitTax — intra-state', () => {
  it('halves a tax that divides evenly', () => {
    expect(splitTax(1800, 'intra')).toEqual({
      supply: 'intra',
      tax: 1800,
      cgst: 900,
      sgst: 900,
      igst: 0,
    });
  });

  it('gives the odd paise to SGST when the tax cannot halve evenly', () => {
    // ₹53.95 of GST — 2697.5 paise a side is not a thing that can be printed.
    const split = splitTax(5395, 'intra');
    expect(split.cgst).toBe(2698);
    expect(split.sgst).toBe(2697);
    expect(split.cgst + split.sgst).toBe(5395);
    expect(split.igst).toBe(0);
  });

  it('never leaks a paise across a spread of odd amounts', () => {
    for (const tax of [1, 3, 7, 99, 101, 2697, 5395, 123457]) {
      const { cgst, sgst, igst } = splitTax(tax, 'intra');
      expect(cgst + sgst + igst).toBe(tax);
    }
  });

  it('splits zero tax into zeroes, not into anything odd', () => {
    expect(splitTax(0, 'intra')).toEqual({
      supply: 'intra',
      tax: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    });
  });
});

describe('splitTax — inter-state', () => {
  it('carries the whole amount as IGST', () => {
    expect(splitTax(5395, 'inter')).toEqual({
      supply: 'inter',
      tax: 5395,
      cgst: 0,
      sgst: 0,
      igst: 5395,
    });
  });

  it('keeps zero tax at zero', () => {
    expect(splitTax(0, 'inter')).toEqual({
      supply: 'inter',
      tax: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    });
  });
});

describe('splitTaxForStates', () => {
  it('splits within a state and carries IGST across one', () => {
    expect(splitTaxForStates(1000, 'Kerala', 'Kerala')).toMatchObject({ cgst: 500, sgst: 500, igst: 0 });
    expect(splitTaxForStates(1000, 'Kerala', 'Goa')).toMatchObject({ cgst: 0, sgst: 0, igst: 1000 });
  });

  it('treats a bill with no state on it as a local sale', () => {
    expect(splitTaxForStates(1001, null, '')).toMatchObject({
      supply: 'intra',
      cgst: 501,
      sgst: 500,
    });
  });
});
