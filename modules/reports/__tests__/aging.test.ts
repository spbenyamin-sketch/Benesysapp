// db/client is stubbed so the report module loads in plain Node — the pure
// allocation below is the part that decides whose door gets knocked on.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { ageCharges, bucketIndexFor, AGING_BUCKETS } from '@/modules/reports/aging';

const TODAY = '2026-08-19';

describe('bucketIndexFor', () => {
  it('puts each age in its own bucket', () => {
    expect(bucketIndexFor(0)).toBe(0);
    expect(bucketIndexFor(30)).toBe(0);
    expect(bucketIndexFor(31)).toBe(1);
    expect(bucketIndexFor(60)).toBe(1);
    expect(bucketIndexFor(61)).toBe(2);
    expect(bucketIndexFor(90)).toBe(2);
    expect(bucketIndexFor(91)).toBe(3);
    expect(bucketIndexFor(5000)).toBe(3);
  });

  it('treats money that is not due yet as current, not as an error', () => {
    expect(bucketIndexFor(-10)).toBe(0);
  });
});

describe('ageCharges', () => {
  // 30 days old, 60 days old, 100 days old.
  const charges = [
    { day: '2026-07-20', amount: 10000 }, // 30 days
    { day: '2026-06-20', amount: 20000 }, // 60 days
    { day: '2026-05-11', amount: 30000 }, // 100 days
  ];

  it('ages every charge when nothing has been settled', () => {
    const aged = ageCharges(charges, 0, TODAY);
    expect(aged.buckets).toEqual([10000, 20000, 0, 30000]);
    expect(aged.total).toBe(60000);
    expect(aged.oldestDays).toBe(100);
  });

  it('settles the oldest money first', () => {
    // ₹300 paid → the 100-day charge goes, and the 60-day one becomes the oldest.
    const aged = ageCharges(charges, 30000, TODAY);
    expect(aged.buckets).toEqual([10000, 20000, 0, 0]);
    expect(aged.total).toBe(30000);
    expect(aged.oldestDays).toBe(60);
  });

  it('eats part of a charge and ages only what is left of it', () => {
    const aged = ageCharges(charges, 35000, TODAY);
    expect(aged.buckets).toEqual([10000, 15000, 0, 0]);
    expect(aged.total).toBe(25000);
  });

  it('always adds up: buckets sum to the total', () => {
    for (const settled of [0, 1, 9999, 30000, 45000, 59999]) {
      const aged = ageCharges(charges, settled, TODAY);
      expect(aged.buckets.reduce((s, b) => s + b, 0)).toBe(aged.total);
      expect(aged.total).toBe(60000 - settled);
    }
  });

  it('never goes negative when more has been paid than was ever charged', () => {
    const aged = ageCharges(charges, 99999999, TODAY);
    expect(aged.buckets).toEqual(AGING_BUCKETS.map(() => 0));
    expect(aged.total).toBe(0);
    expect(aged.oldestDays).toBe(0);
  });

  it('takes a due date that has not arrived as current', () => {
    const aged = ageCharges([{ day: '2026-09-30', amount: 5000 }], 0, TODAY);
    expect(aged.buckets[0]).toBe(5000);
    expect(aged.oldestDays).toBe(0);
  });

  it('has nothing to say about a party with no charges', () => {
    expect(ageCharges([], 0, TODAY)).toEqual({
      buckets: AGING_BUCKETS.map(() => 0),
      total: 0,
      oldestDays: 0,
    });
  });
});
