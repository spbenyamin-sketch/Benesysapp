// A purchase bill is where the shop learns what its goods now cost: the rate
// paid is written back onto the item and frozen onto the line. Both of those
// have to be the PRE-TAX figure, or a shop that buys at tax-inclusive counter
// prices would see its cost — and therefore its profit — off by the GST.
//
// db/client is stubbed so the service loads in plain Node; unitCostFrom never
// touches it.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { editedLineCost, stockSign, unitCostFrom } from '@/modules/invoices/service';
import { computeLine } from '@/utils/gst';

describe('editedLineCost', () => {
  const base = { isPurchase: false, amount: 20000, qty: 1000 };

  test('keeps the cost frozen on the bill, even if the item is dearer today', () => {
    expect(editedLineCost({ ...base, frozen: 15000, current: 18000 })).toBe(15000);
  });

  test('uses today’s price only for a line that was not on the bill before', () => {
    expect(editedLineCost({ ...base, frozen: undefined, current: 18000 })).toBe(18000);
  });

  test('an old line with no cost recorded falls through to today’s price', () => {
    expect(editedLineCost({ ...base, frozen: null, current: 18000 })).toBe(18000);
  });

  test('on a purchase the corrected rate IS the corrected cost', () => {
    // 2 units for ₹300 pre-tax → ₹150/unit, regardless of what was frozen.
    expect(
      editedLineCost({ isPurchase: true, amount: 30000, qty: 2000, frozen: 9000, current: 9000 }),
    ).toBe(15000);
  });

  test('an explicit cost (a sale return carrying the original) wins outright', () => {
    expect(editedLineCost({ ...base, explicit: 12345, frozen: 15000, current: 18000 })).toBe(12345);
  });

  test('nothing known at all is zero, not a guess', () => {
    expect(editedLineCost({ ...base })).toBe(0);
  });
});

describe('stockSign', () => {
  test('a sale ships goods out; a purchase and a sale return bring them in', () => {
    expect(stockSign('sale')).toBe(-1);
    expect(stockSign('purchase')).toBe(1);
    expect(stockSign('saleReturn')).toBe(1);
  });

  test('a quotation or challan moves nothing', () => {
    expect(stockSign('quotation')).toBe(0);
    expect(stockSign('challan')).toBe(0);
  });
});

describe('unitCostFrom', () => {
  test('gives back the rate when tax was added on top', () => {
    // 3 units @ ₹99.90, 18% extra → line amount stays pre-tax.
    const line = computeLine({ qty: 3000, rate: 9990, taxRate: 1800 }, 'exclusive');
    expect(unitCostFrom(line.amount, 3000)).toBe(9990);
  });

  test('backs the tax out of a rate that already contained it', () => {
    // ₹118 paid per unit @ 18% → the goods cost ₹100.
    const line = computeLine({ qty: 1000, rate: 11800, taxRate: 1800 }, 'inclusive');
    expect(unitCostFrom(line.amount, 1000)).toBe(10000);
  });

  test('works off a fractional quantity', () => {
    // 1.5 kg for ₹300 → ₹200/kg.
    expect(unitCostFrom(30000, 1500)).toBe(20000);
  });

  test('a zero quantity has no unit cost to speak of', () => {
    expect(unitCostFrom(5000, 0)).toBe(0);
  });
});
