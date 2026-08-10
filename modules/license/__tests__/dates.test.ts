import { dayNumber, daysBetween, groupFour, isValidDate, todayISO } from '@/modules/license/dates';

// An off-by-one here is a shop locked out a day early, or a licence that runs a
// day long. Both are worth a test.

describe('dayNumber', () => {
  it('counts from 1 Jan 2020', () => {
    expect(dayNumber('2020-01-01')).toBe(0);
    expect(dayNumber('2020-01-02')).toBe(1);
  });

  it('handles leap days', () => {
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
    expect(dayNumber('2027-03-01') - dayNumber('2027-02-28')).toBe(1);
  });

  it('rejects a date that does not exist', () => {
    // Date.UTC would silently roll these into the next month.
    expect(dayNumber('2026-02-31')).toBeNaN();
    expect(dayNumber('2027-02-29')).toBeNaN();
    expect(dayNumber('2026-13-01')).toBeNaN();
  });

  it('rejects anything that is not an ISO day', () => {
    expect(dayNumber('10/08/2026')).toBeNaN();
    expect(dayNumber('2026-8-1')).toBeNaN();
    expect(dayNumber('')).toBeNaN();
  });
});

describe('isValidDate', () => {
  it('agrees with dayNumber', () => {
    expect(isValidDate('2026-08-10')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('nonsense')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-08-10', '2026-08-17')).toBe(7);
    expect(daysBetween('2026-08-10', '2026-08-10')).toBe(0);
    expect(daysBetween('2026-08-10', '2026-08-09')).toBe(-1);
  });

  it('crosses a year end', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('todayISO', () => {
  it('formats in the phone timezone, not UTC', () => {
    // 00:30 local on the 10th is still the 9th in UTC — an expiry check must not
    // lose a day to that.
    expect(todayISO(new Date(2026, 7, 10, 0, 30))).toBe('2026-08-10');
    expect(todayISO(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });
});

describe('groupFour', () => {
  it('breaks a System ID into readable blocks', () => {
    expect(groupFour('9F3C11AB7E2004D5')).toBe('9F3C-11AB-7E20-04D5');
  });

  it('leaves a short remainder alone', () => {
    expect(groupFour('ABCDE')).toBe('ABCD-E');
    expect(groupFour('')).toBe('');
  });
});
