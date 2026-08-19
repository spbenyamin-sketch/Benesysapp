// Where the shop's money actually sits: the cash box, and each bank account.
//
// Balances are DERIVED here, exactly as party balances are — opening balance
// plus everything that moved through the account. Nothing is stored, so a
// corrected payment corrects the cash book at the same moment it corrects the
// ledger, and the two can never tell different stories.
//
// Rows written before accounts existed carry no account at all. They are not
// guessed at: they gather under "Not assigned", where they can be seen and
// fixed rather than quietly landing in the wrong box.

import { listExpenses } from '@/modules/expenses/service';
import { listPaymentsWithParty, paymentDirection } from '@/modules/payments/service';
import type { BankAccount } from '@/db/schema';
import { listBankAccounts } from '@/modules/bankAccounts/service';

export type AccountEntryKind = 'opening' | 'paymentIn' | 'paymentOut' | 'expense';

export interface AccountEntry {
  key: string;
  date: string; // ISO day
  kind: AccountEntryKind;
  label: string;
  sub: string;
  delta: number; // signed paise; + money into the account
  balance: number; // running balance after this entry
}

export interface AccountBook {
  /** null for the "Not assigned" book — money recorded before it had a home. */
  account: BankAccount | null;
  entries: AccountEntry[];
  balance: number;
}

export interface AccountWithBalance {
  account: BankAccount;
  balance: number;
}

export interface AccountBalances {
  accounts: AccountWithBalance[];
  /** Money moved with no account named. Zero for a shop that always names one. */
  unassigned: number;
  unassignedCount: number;
  /** Everything the shop holds, across every account. */
  total: number;
}

/**
 * Which account a form should offer first: the cash box if there is one, since
 * that is where a small shop's money actually moves. Lives here rather than in
 * the picker so it can be tested without a screen.
 */
export function defaultAccount(accounts: BankAccount[]): BankAccount | undefined {
  return accounts.find((a) => a.type === 'cash') ?? accounts[0];
}

/**
 * Run a dated list of movements into a running balance. Pure.
 *
 * The opening balance stays first whatever its date — it is where the account
 * starts, not something that happened on a day. Everything else runs by date,
 * the same convention the party ledger uses.
 */
export function runningBalance(
  opening: Omit<AccountEntry, 'balance'> | null,
  moves: Omit<AccountEntry, 'balance'>[],
): { entries: AccountEntry[]; balance: number } {
  const sorted = [...moves].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let running = 0;
  const entries = (opening ? [opening, ...sorted] : sorted).map((m) => {
    running += m.delta;
    return { ...m, balance: running };
  });
  return { entries, balance: running };
}

/**
 * Every movement of money, tagged with the account it went through. One pass
 * over payments and expenses, shared by the balances list and each account's
 * book so a row can never appear in one and not the other.
 */
async function allMoves(): Promise<Map<number | null, Omit<AccountEntry, 'balance'>[]>> {
  const [payments, expenses] = await Promise.all([listPaymentsWithParty(), listExpenses()]);
  const byAccount = new Map<number | null, Omit<AccountEntry, 'balance'>[]>();
  const push = (accountId: number | null, move: Omit<AccountEntry, 'balance'>) => {
    const list = byAccount.get(accountId) ?? [];
    list.push(move);
    byAccount.set(accountId, list);
  };

  for (const p of payments) {
    const into = paymentDirection(p, p.partyType) === 'in';
    push(p.accountId ?? null, {
      key: `pay-${p.id}`,
      date: p.date,
      kind: into ? 'paymentIn' : 'paymentOut',
      label: p.invoiceNo ?? 'On account',
      sub: `${p.partyName} · ${p.mode.toUpperCase()}`,
      delta: into ? p.amount : -p.amount,
    });
  }

  for (const e of expenses) {
    push(e.accountId ?? null, {
      key: `exp-${e.id}`,
      date: e.date,
      kind: 'expense',
      label: e.category,
      sub: e.notes ?? 'Expense',
      delta: -e.amount,
    });
  }

  return byAccount;
}

/** What each account holds right now, plus anything still unassigned. */
export async function accountBalances(): Promise<AccountBalances> {
  const [accounts, moves] = await Promise.all([listBankAccounts(), allMoves()]);

  const withBalance = accounts.map((account) => ({
    account,
    balance:
      account.openingBalance +
      (moves.get(account.id) ?? []).reduce((s, m) => s + m.delta, 0),
  }));

  const loose = moves.get(null) ?? [];
  const unassigned = loose.reduce((s, m) => s + m.delta, 0);
  return {
    accounts: withBalance,
    unassigned,
    unassignedCount: loose.length,
    total: withBalance.reduce((s, a) => s + a.balance, 0) + unassigned,
  };
}

/**
 * One account's book: its opening balance, then every movement through it with
 * the balance after each. Pass null for the money that was never assigned.
 */
export async function accountBook(accountId: number | null): Promise<AccountBook | null> {
  const [accounts, moves] = await Promise.all([listBankAccounts(), allMoves()]);
  const account = accountId == null ? null : accounts.find((a) => a.id === accountId);
  if (accountId != null && !account) return null;

  const opening =
    account && account.openingBalance !== 0
      ? {
          key: 'opening',
          date: account.createdAt.slice(0, 10),
          kind: 'opening' as const,
          label: 'Opening balance',
          sub: account.type === 'cash' ? 'Cash in hand' : 'Bank',
          delta: account.openingBalance,
        }
      : null;

  const { entries, balance } = runningBalance(opening, moves.get(accountId) ?? []);
  return { account: account ?? null, entries, balance };
}
