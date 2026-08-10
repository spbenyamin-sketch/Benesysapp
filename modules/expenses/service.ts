import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { expenses, type Expense, type NewExpense } from '@/db/schema';
import { splitInclusive } from '@/utils/gst';

// Shop overheads (rent, power, wages…). Stock bought for resale does NOT belong
// here — that goes through a purchase invoice, which moves inventory and the
// supplier's ledger. An expense only records money leaving the business.
//
// AMOUNT CONVENTION: `amount` is the GROSS paise actually paid — what the bill
// says. `taxRate` (basis points) is the GST already sitting inside that amount,
// so the taxable value and the tax are backed out of it, never added on top.
// A shopkeeper types the number printed on the bill and nothing else.

export type ExpenseInput = Omit<NewExpense, 'id' | 'createdAt'>;

export async function createExpense(data: ExpenseInput): Promise<Expense> {
  const [row] = await db.insert(expenses).values(data).returning();
  return row;
}

/** Newest first — an expense list is read like a bank statement. */
export async function listExpenses(): Promise<Expense[]> {
  return db.select().from(expenses).orderBy(desc(expenses.date), desc(expenses.id));
}

export async function getExpense(id: number): Promise<Expense | undefined> {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  return row;
}

export async function updateExpense(id: number, data: Partial<ExpenseInput>): Promise<Expense | undefined> {
  const [row] = await db.update(expenses).set(data).where(eq(expenses.id, id)).returning();
  return row;
}

export async function deleteExpense(id: number): Promise<void> {
  await db.delete(expenses).where(eq(expenses.id, id));
}

// ── Derived figures (pure — no DB, so the screens and any future report share them)

/** The taxable value and the GST inside a gross expense amount. */
export function expenseTax(e: Pick<Expense, 'amount' | 'taxRate'>): {
  amount: number;
  tax: number;
} {
  return splitInclusive(e.amount, e.taxRate);
}

export interface CategoryTotal {
  category: string;
  total: number; // paise, gross
  count: number;
}

export interface ExpenseSummary {
  total: number; // paise, gross
  taxable: number; // paise, pre-GST
  tax: number; // paise, GST inside the total
  count: number;
  /** Biggest spend first — that is the order the question gets asked in. */
  byCategory: CategoryTotal[];
}

export function summariseExpenses(rows: Expense[]): ExpenseSummary {
  const byCategory = new Map<string, CategoryTotal>();
  let total = 0;
  let tax = 0;

  for (const row of rows) {
    total += row.amount;
    tax += expenseTax(row).tax;
    const entry = byCategory.get(row.category) ?? { category: row.category, total: 0, count: 0 };
    entry.total += row.amount;
    entry.count += 1;
    byCategory.set(row.category, entry);
  }

  return {
    total,
    taxable: total - tax,
    tax,
    count: rows.length,
    byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total),
  };
}

/** Expenses dated within an inclusive ISO day range. */
export function filterExpensesByRange(rows: Expense[], from: string, to: string): Expense[] {
  return rows.filter((r) => r.date >= from && r.date <= to);
}
