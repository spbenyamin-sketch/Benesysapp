import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoices, payments, type NewPayment, type Payment } from '@/db/schema';

export type PaymentInput = Omit<NewPayment, 'id' | 'createdAt'>;

export async function createPayment(data: PaymentInput): Promise<Payment> {
  const [row] = await db.insert(payments).values(data).returning();
  return row;
}

export async function listPayments(): Promise<Payment[]> {
  return db.select().from(payments).orderBy(payments.date);
}

export async function listPaymentsByParty(partyId: number): Promise<Payment[]> {
  return db.select().from(payments).where(eq(payments.partyId, partyId));
}

export async function listPaymentsByInvoice(invoiceId: number): Promise<Payment[]> {
  return db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
}

export async function getPayment(id: number): Promise<Payment | undefined> {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  return row;
}

export async function updatePayment(id: number, data: Partial<PaymentInput>): Promise<Payment | undefined> {
  const [row] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
  return row;
}

export async function deletePayment(id: number): Promise<void> {
  const existing = await getPayment(id);
  await db.delete(payments).where(eq(payments.id, id));
  if (existing?.invoiceId != null) await recomputeInvoiceStatus(existing.invoiceId);
}

// ── Phase 5: keep an invoice's paymentStatus in sync with its payments ─────────
// paymentStatus is a convenience flag; the party ledger balance is still the
// source of truth (computed in modules/parties/ledger.ts). We derive the flag
// from total paid vs grandTotal.
export async function recomputeInvoiceStatus(invoiceId: number): Promise<void> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return;
  const linked = await listPaymentsByInvoice(invoiceId);
  const paid = linked.reduce((s, p) => s + p.amount, 0);
  const status = paid <= 0 ? 'unpaid' : paid >= inv.grandTotal ? 'paid' : 'partial';
  await db.update(invoices).set({ paymentStatus: status }).where(eq(invoices.id, invoiceId));
}

/** Record a payment and, if it's tied to an invoice, refresh that invoice's status. */
export async function recordPayment(data: PaymentInput): Promise<Payment> {
  const row = await createPayment(data);
  if (data.invoiceId != null) await recomputeInvoiceStatus(data.invoiceId);
  return row;
}
