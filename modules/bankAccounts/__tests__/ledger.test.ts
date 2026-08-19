// db/client is stubbed so the module loads in plain Node. What is pinned here is
// the running balance itself — the column a shopkeeper reconciles against a
// passbook line by line, where one row out of order is one wrong answer.
jest.mock('@/db/client', () => ({ db: {}, sqlite: {} }));

import { defaultAccount, runningBalance, type AccountEntry } from '@/modules/bankAccounts/ledger';
import type { BankAccount } from '@/db/schema';

const move = (
  key: string,
  date: string,
  delta: number,
): Omit<AccountEntry, 'balance'> => ({
  key,
  date,
  kind: delta > 0 ? 'paymentIn' : 'paymentOut',
  label: key,
  sub: '',
  delta,
});

const opening = (amount: number, date = '2026-08-15'): Omit<AccountEntry, 'balance'> => ({
  key: 'opening',
  date,
  kind: 'opening',
  label: 'Opening balance',
  sub: '',
  delta: amount,
});

describe('runningBalance', () => {
  it('runs movements by date and carries the balance through', () => {
    const { entries, balance } = runningBalance(null, [
      move('b', '2026-08-10', -3000),
      move('a', '2026-08-01', 10000),
      move('c', '2026-08-20', 500),
    ]);
    expect(entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
    expect(entries.map((e) => e.balance)).toEqual([10000, 7000, 7500]);
    expect(balance).toBe(7500);
  });

  it('starts from the opening balance and keeps it first', () => {
    // The opening balance is dated AFTER both movements here — it is still the
    // line the account starts from, not something that happened that day.
    const { entries, balance } = runningBalance(opening(50000, '2026-08-31'), [
      move('a', '2026-08-01', 10000),
      move('b', '2026-08-02', -20000),
    ]);
    expect(entries.map((e) => e.key)).toEqual(['opening', 'a', 'b']);
    expect(entries.map((e) => e.balance)).toEqual([50000, 60000, 40000]);
    expect(balance).toBe(40000);
  });

  it('lets a cash box go negative rather than hiding an overdraft', () => {
    const { balance } = runningBalance(null, [move('a', '2026-08-01', -5000)]);
    expect(balance).toBe(-5000);
  });

  it('gives an untouched account its opening balance and nothing else', () => {
    expect(runningBalance(opening(25000), [])).toMatchObject({ balance: 25000 });
    expect(runningBalance(null, [])).toEqual({ entries: [], balance: 0 });
  });

  it('does not mutate what it was handed', () => {
    const moves = [move('b', '2026-08-10', 100), move('a', '2026-08-01', 200)];
    runningBalance(null, moves);
    expect(moves.map((m) => m.key)).toEqual(['b', 'a']);
  });
});

const account = (over: Partial<BankAccount> = {}): BankAccount => ({
  id: 1,
  name: 'Counter cash',
  type: 'cash',
  openingBalance: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('defaultAccount', () => {
  it('picks the cash box — that is where a small shop’s money moves', () => {
    const chosen = defaultAccount([
      account({ id: 1, name: 'SBI', type: 'bank' }),
      account({ id: 2, name: 'Counter', type: 'cash' }),
    ]);
    expect(chosen?.id).toBe(2);
  });

  it('falls back to the first account when there is no cash box', () => {
    const chosen = defaultAccount([
      account({ id: 3, name: 'SBI', type: 'bank' }),
      account({ id: 4, name: 'HDFC', type: 'bank' }),
    ]);
    expect(chosen?.id).toBe(3);
  });

  it('has nothing to pick before any account exists', () => {
    expect(defaultAccount([])).toBeUndefined();
  });
});
