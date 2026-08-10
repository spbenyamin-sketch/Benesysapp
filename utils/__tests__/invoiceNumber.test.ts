import {
  financialYear,
  formatInvoiceNo,
  nextInvoiceNo,
  nextSequence,
  prefixFor,
} from '@/utils/invoiceNumber';

// Invoice numbers are the one field a shop can never have collide or repeat —
// GST filing keys off them. Indian FY runs 1 Apr → 31 Mar.

describe('financialYear', () => {
  it('puts April through December in the year that starts it', () => {
    expect(financialYear(new Date(2026, 3, 1))).toEqual({
      label: '2026-27',
      start: '2026-04-01',
      end: '2027-03-31',
    });
    expect(financialYear(new Date(2026, 11, 31)).label).toBe('2026-27');
  });

  it('puts January through March in the FY that began the previous April', () => {
    expect(financialYear(new Date(2027, 0, 5)).label).toBe('2026-27');
    expect(financialYear(new Date(2027, 2, 31)).label).toBe('2026-27');
  });

  it('rolls over on 1 April, not 1 January', () => {
    expect(financialYear(new Date(2027, 2, 31)).label).toBe('2026-27');
    expect(financialYear(new Date(2027, 3, 1)).label).toBe('2027-28');
  });
});

describe('prefixFor', () => {
  it('uses a distinct default prefix per document type', () => {
    expect(prefixFor('sale')).toBe('INV');
    expect(prefixFor('purchase')).toBe('PUR');
    expect(prefixFor('quotation')).toBe('QTN');
    expect(prefixFor('challan')).toBe('DC');
  });

  it('lets the business profile override the sale prefix only', () => {
    expect(prefixFor('sale', 'BENE')).toBe('BENE');
    expect(prefixFor('purchase', 'BENE')).toBe('PUR');
  });

  it('ignores a blank or whitespace override', () => {
    expect(prefixFor('sale', '   ')).toBe('INV');
    expect(prefixFor('sale', null)).toBe('INV');
  });
});

describe('formatInvoiceNo', () => {
  it('zero-pads the sequence to three digits', () => {
    expect(formatInvoiceNo('INV', '2026-27', 1)).toBe('INV/2026-27/001');
    expect(formatInvoiceNo('INV', '2026-27', 42)).toBe('INV/2026-27/042');
  });

  it('does not truncate a sequence past 999', () => {
    expect(formatInvoiceNo('INV', '2026-27', 1234)).toBe('INV/2026-27/1234');
  });
});

describe('nextSequence', () => {
  it('starts at 1 when nothing exists yet', () => {
    expect(nextSequence([], 'INV', '2026-27')).toBe(1);
  });

  it('continues from the highest number used, not the count', () => {
    // The middle invoice was deleted — 003 must still not be re-issued.
    const existing = ['INV/2026-27/001', 'INV/2026-27/003'];
    expect(nextSequence(existing, 'INV', '2026-27')).toBe(4);
  });

  it('counts each financial year separately', () => {
    const existing = ['INV/2026-27/007', 'INV/2027-28/001'];
    expect(nextSequence(existing, 'INV', '2027-28')).toBe(2);
    expect(nextSequence(existing, 'INV', '2028-29')).toBe(1);
  });

  it('keeps document types from colliding', () => {
    const existing = ['INV/2026-27/009', 'PUR/2026-27/002'];
    expect(nextSequence(existing, 'PUR', '2026-27')).toBe(3);
  });

  it('ignores malformed numbers instead of throwing', () => {
    const existing = ['INV/2026-27/abc', 'INV/2026-27/002', 'nonsense'];
    expect(nextSequence(existing, 'INV', '2026-27')).toBe(3);
  });
});

describe('nextInvoiceNo', () => {
  it('assembles prefix, FY and sequence', () => {
    const now = new Date(2026, 6, 5); // 5 Jul 2026 → FY 2026-27
    expect(nextInvoiceNo('sale', ['INV/2026-27/001'], now)).toBe('INV/2026-27/002');
  });

  it('restarts the sequence in a new financial year', () => {
    const existing = ['INV/2026-27/044'];
    expect(nextInvoiceNo('sale', existing, new Date(2027, 3, 1))).toBe('INV/2027-28/001');
  });

  it('honours the sale prefix override', () => {
    expect(nextInvoiceNo('sale', [], new Date(2026, 6, 5), 'BENE')).toBe('BENE/2026-27/001');
  });
});
