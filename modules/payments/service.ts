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

/**
 * Change a payment and refresh the paid status of every invoice it touches —
 * the one it was against before AND the one it is against now, since moving or
 * resizing a payment changes what both bills have received. Party balances are
 * never stored, so nothing else needs fixing up.
 */
export async function updatePayment(id: number, data: Partial<PaymentInput>): Promise<Payment | undefined> {
  const before = await getPayment(id);
  const [row] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
  for (const invoiceId of invoicesToRefresh(before?.invoiceId, row?.invoiceId)) {
    await recomputeInvoiceStatus(invoiceId);
  }
  return row;
}

/** The invoices whose paid status an edit can change: the old link and the new one, once each. */
export function invoicesToRefresh(
  before: number | null | undefined,
  after: number | null | undefined,
): number[] {
  const ids: number[] = [];
  if (before != null) ids.push(before);
  if (after != null && after !== before) ids.push(after);
  return ids;
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
/**
 * Money settled against one invoice, in the direction that invoice expects — a
 * payment running the other way (a refund against a sale) gives money back, so
 * it subtracts. Used to set the status, and to warn before an edit drops a
 * bill's total below what the customer has already handed over.
 */
export async function netPaidForInvoice(invoiceId: number): Promise<number> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return 0;
  const [linked, [party]] = await Promise.all([
    listPaymentsByInvoice(invoiceId),
    db.select().from(parties).where(eq(parties.id, inv.partyId)),
  ]);
  const normal = defaultDirectionForInvoice(inv.type);
  return linked.reduce((s, p) => {
    const dir = paymentDirection(p, party?.type ?? 'customer');
    return dir === normal ? s + p.amount : s - p.amount;
  }, 0);
}

export async function recomputeInvoiceStatus(invoiceId: number): Promise<void> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return;
  const paid = await netPaidForInvoice(invoiceId);
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

/**
 * The direction a payment against this invoice normally runs. Money goes out to
 * a supplier we bought from — and out to a customer we took goods back from,
 * because settling a credit note means refunding them. A debit note runs the
 * other way: goods went back to the supplier, so the money comes back to us.
 */
export function defaultDirectionForInvoice(type: string): Direction {
  return type === 'purchase' || type === 'saleReturn' ? 'out' : 'in';
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
      accountId: payments.accountId,
      date: payments.date,
      notes: payments.notes,
      accounted: payments.accounted,
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

// ── Search (pure — the list is already loaded, so it filters on the client) ──

/**
 * Does one typed word match an amount? Read as rupees and matched from the
 * front, so "500" finds ₹500 and ₹500.50 but not ₹1,500. "₹1,500" works too.
 */
export function amountMatchesTerm(paise: number, term: string): boolean {
  const n = term.replace(/[₹,]/g, '');
  if (!/^\d+(\.\d*)?$/.test(n)) return false;
  const rupees = paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
  return rupees.startsWith(n);
}

/**
 * Every word typed must hit something: the party, the note, the bill number,
 * the mode, or the amount.
 */
export function searchPayments<
  T extends Pick<PaymentWithParty, 'amount' | 'partyName' | 'notes' | 'invoiceNo' | 'mode'>,
>(rows: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  return rows.filter((r) => {
    const text = [r.partyName, r.notes ?? '', r.invoiceNo ?? '', r.mode].join(' ').toLowerCase();
    return terms.every((t) => text.includes(t) || amountMatchesTerm(r.amount, t));
  });
}
