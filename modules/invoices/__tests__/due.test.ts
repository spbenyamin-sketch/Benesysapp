import { daysOverdue, dueDayOf, isOverdue } from '@/modules/invoices/due';

// "Late" is a word the app says to a shopkeeper about their own customer, so it
// has to be earned. These pin the two rules that keep it honest: ageing always
// has a day to count from, but nothing is CALLED late unless a due date was
// actually agreed.

const TODAY = '2026-08-19';

const bill = (over: Partial<Parameters<typeof isOverdue>[0]> = {}) => ({
  type: 'sale',
  date: '2026-07-01',
  dueDate: null as string | null,
  paymentStatus: 'unpaid' as const,
  ...over,
});

describe('dueDayOf', () => {
  it('uses the due date when one was agreed', () => {
    expect(dueDayOf(bill({ dueDate: '2026-07-31' }))).toBe('2026-07-31');
  });

  it('falls back to the day of the bill', () => {
    expect(dueDayOf(bill())).toBe('2026-07-01');
  });
});

describe('daysOverdue', () => {
  it('counts from the due day', () => {
    expect(daysOverdue(bill({ dueDate: '2026-08-09' }), TODAY)).toBe(10);
  });

  it('goes negative while the money is still not due', () => {
    expect(daysOverdue(bill({ dueDate: '2026-08-29' }), TODAY)).toBe(-10);
  });
});

describe('isOverdue', () => {
  it('flags an unpaid bill past its due date', () => {
    expect(isOverdue(bill({ dueDate: '2026-08-09' }), TODAY)).toBe(true);
  });

  it('says nothing about a bill with no agreed due date', () => {
    // Otherwise every credit bill from yesterday would shout, and a warning that
    // is always on is not a warning.
    expect(isOverdue(bill({ date: '2020-01-01' }), TODAY)).toBe(false);
  });

  it('is silent on the due day itself', () => {
    expect(isOverdue(bill({ dueDate: TODAY }), TODAY)).toBe(false);
  });

  it('is silent once the bill is paid', () => {
    expect(isOverdue(bill({ dueDate: '2026-08-09', paymentStatus: 'paid' }), TODAY)).toBe(false);
  });

  it('still flags a part-paid bill — the rest is still late', () => {
    expect(isOverdue(bill({ dueDate: '2026-08-09', paymentStatus: 'partial' }), TODAY)).toBe(true);
  });

  it('never flags a document that owes nothing', () => {
    for (const type of ['quotation', 'challan', 'saleReturn']) {
      expect(isOverdue(bill({ type, dueDate: '2026-01-01' }), TODAY)).toBe(false);
    }
  });
});
