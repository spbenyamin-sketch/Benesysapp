import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bankAccounts, type BankAccount, type NewBankAccount } from '@/db/schema';

export type BankAccountInput = Omit<NewBankAccount, 'id' | 'createdAt'>;

export async function createBankAccount(data: BankAccountInput): Promise<BankAccount> {
  const [row] = await db.insert(bankAccounts).values(data).returning();
  return row;
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  return db.select().from(bankAccounts).orderBy(bankAccounts.name);
}

export async function getBankAccount(id: number): Promise<BankAccount | undefined> {
  const [row] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id));
  return row;
}

export async function updateBankAccount(
  id: number,
  data: Partial<BankAccountInput>,
): Promise<BankAccount | undefined> {
  const [row] = await db.update(bankAccounts).set(data).where(eq(bankAccounts.id, id)).returning();
  return row;
}

export async function deleteBankAccount(id: number): Promise<void> {
  await db.delete(bankAccounts).where(eq(bankAccounts.id, id));
}
