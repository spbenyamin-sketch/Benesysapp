import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { expenses, type Expense, type NewExpense } from '@/db/schema';

export type ExpenseInput = Omit<NewExpense, 'id' | 'createdAt'>;

export async function createExpense(data: ExpenseInput): Promise<Expense> {
  const [row] = await db.insert(expenses).values(data).returning();
  return row;
}

export async function listExpenses(): Promise<Expense[]> {
  return db.select().from(expenses).orderBy(expenses.date);
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
