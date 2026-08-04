import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoices, parties, payments, type NewPayment, type Party, type Payment } from '@/db/schema';

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
  const [linked, [party]] = await Promise.all([
    listPaymentsByInvoice(invoiceId),
    db.select().from(parties).where(eq(parties.id, inv.partyId)),
  ]);
  // A payment running the other way (a refund against a sale) gives money back,
  // so it subtracts from what has been settled on this invoice.
  const normal = defaultDirectionForInvoice(inv.type);
  const paid = linked.reduce((s, p) => {
    const dir = paymentDirection(p, party?.type ?? 'customer');
    return dir === normal ? s + p.amount : s - p.amount;
  }, 0);
  const status = paid <= 0 ? 'unpaid' : paid >= inv.grandTotal ? 'paid' : 'partial';
  await db.update(invoices).set({ paymentStatus: status }).where(eq(invoices.id, invoiceId));
}

// ── Payment history ───────────────────────────────────────────────────────────
export interface PaymentWithParty extends Payment {
  partyName: string;
  partyType: Party['type'];
  invoiceNo: string | null;
}

export type Direction = 'in' | 'out';

/**
 * Which way the money moved. `payments.direction` is authoritative; rows written
 * before that column existed have NULL and fall back to the party type
 * (customer = money in, supplier = money out) — the rule the app used then.
 */
export function paymentDirection(
  payment: { direction?: Direction | null },
  partyType: Party['type'],
): Direction {
  return payment.direction ?? (partyType === 'supplier' ? 'out' : 'in');
}

/** The direction a payment against this invoice normally runs. */
export function defaultDirectionForInvoice(type: string): Direction {
  return type === 'purchase' ? 'out' : 'in';
}

export async function listPaymentsWithParty(limit?: number): Promise<PaymentWithParty[]> {
  const q = db
    .select({
      id: payments.id,
      partyId: payments.partyId,
      invoiceId: payments.invoiceId,
      amount: payments.amount,
      mode: payments.mode,
      direction: payments.direction,
      date: payments.date,
      notes: payments.notes,
      createdAt: payments.createdAt,
      partyName: parties.name,
      partyType: parties.type,
      invoiceNo: invoices.invoiceNo,
    })
    .from(payments)
    .innerJoin(parties, eq(payments.partyId, parties.id))
    .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
    .orderBy(desc(payments.date), desc(payments.id));
  return limit ? q.limit(limit) : q;
}

/** Record a payment and, if it's tied to an invoice, refresh that invoice's status. */
export async function recordPayment(data: PaymentInput): Promise<Payment> {
  const row = await createPayment(data);
  if (data.invoiceId != null) await recomputeInvoiceStatus(data.invoiceId);
  return row;
}
