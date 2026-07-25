import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  invoiceItems,
  invoices,
  items,
  parties,
  type Invoice,
  type InvoiceItem,
  type NewInvoice,
  type NewInvoiceItem,
  type Party,
} from '@/db/schema';
import { getSetting } from '@/modules/settings/service';
import { computeTotals, type TaxMode } from '@/utils/gst';
import { nextInvoiceNo, type InvoiceType } from '@/utils/invoiceNumber';

export type InvoiceInput = Omit<NewInvoice, 'id' | 'createdAt'>;
export type InvoiceItemInput = Omit<NewInvoiceItem, 'id'>;

// ── Basic CRUD (Phase 1) ──────────────────────────────────────────────────────
export async function createInvoice(data: InvoiceInput): Promise<Invoice> {
  const [row] = await db.insert(invoices).values(data).returning();
  return row;
}

export async function listInvoices(): Promise<Invoice[]> {
  return db.select().from(invoices).orderBy(desc(invoices.date), desc(invoices.id));
}

export async function listInvoicesByParty(partyId: number): Promise<Invoice[]> {
  return db.select().from(invoices).where(eq(invoices.partyId, partyId)).orderBy(invoices.date);
}

export async function getInvoice(id: number): Promise<Invoice | undefined> {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  return row;
}

export async function updateInvoice(id: number, data: Partial<InvoiceInput>): Promise<Invoice | undefined> {
  const [row] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
  return row;
}

export async function deleteInvoice(id: number): Promise<void> {
  // invoice_items cascade-delete via FK.
  await db.delete(invoices).where(eq(invoices.id, id));
}

// ── Line items ────────────────────────────────────────────────────────────────
export async function addInvoiceItem(data: InvoiceItemInput): Promise<InvoiceItem> {
  const [row] = await db.insert(invoiceItems).values(data).returning();
  return row;
}

export async function listInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
  return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function deleteInvoiceItem(id: number): Promise<void> {
  await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
}

// ── Phase 4: transactional create-with-lines + auto number + stock movement ────
export interface InvoiceLineInput {
  itemId: number;
  qty: number; // thousandths
  rate: number; // paise per unit
  taxRate: number; // basis points
}

export interface InvoiceHeaderInput {
  type: InvoiceType;
  partyId: number;
  date: string; // ISO 'YYYY-MM-DD'
  discount?: number; // paise
  paymentStatus?: Invoice['paymentStatus'];
  taxMode?: TaxMode; // default 'exclusive' — see utils/gst
}

// Stock direction: a sale ships goods out (−), a purchase brings them in (+);
// quotations/challans don't move stock.
function stockSign(type: InvoiceType): -1 | 0 | 1 {
  if (type === 'sale') return -1;
  if (type === 'purchase') return 1;
  return 0;
}

/**
 * Create an invoice with its line items in a single transaction: totals are
 * computed (integer paise) via utils/gst, the invoice number is auto-generated
 * per financial year, and item stock is auto in/decremented. Rolls back wholly
 * on any error.
 */
export async function createInvoiceWithItems(
  header: InvoiceHeaderInput,
  lines: InvoiceLineInput[],
): Promise<Invoice> {
  const now = new Date();
  // Read state that needs async access BEFORE the (synchronous) transaction.
  const existing = await db
    .select({ invoiceNo: invoices.invoiceNo })
    .from(invoices)
    .where(eq(invoices.type, header.type));
  const salePrefix = header.type === 'sale' ? await getSetting('sale_prefix') : undefined;
  const invoiceNo = nextInvoiceNo(header.type, existing.map((e) => e.invoiceNo), now, salePrefix);

  const taxMode: TaxMode = header.taxMode ?? 'exclusive';
  const { lines: computed, totals } = computeTotals(lines, header.discount ?? 0, taxMode);
  const sign = stockSign(header.type);

  return db.transaction((tx) => {
    const inv = tx
      .insert(invoices)
      .values({
        type: header.type,
        invoiceNo,
        partyId: header.partyId,
        date: header.date,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discount: totals.discount,
        grandTotal: totals.grandTotal,
        paymentStatus: header.paymentStatus ?? 'unpaid',
        taxMode,
      })
      .returning()
      .get();

    lines.forEach((l, i) => {
      tx.insert(invoiceItems)
        .values({
          invoiceId: inv.id,
          itemId: l.itemId,
          qty: l.qty,
          rate: l.rate,
          taxRate: l.taxRate,
          amount: computed[i].amount,
        })
        .run();
      if (sign !== 0) {
        tx.update(items)
          .set({ currentStock: sql`${items.currentStock} + ${sign * l.qty}` })
          .where(eq(items.id, l.itemId))
          .run();
      }
    });

    return inv;
  });
}

export interface InvoiceLineRow extends InvoiceItem {
  itemName: string;
  itemUnit: string;
}

export interface InvoiceDetail {
  invoice: Invoice;
  party: Party | undefined;
  lines: InvoiceLineRow[];
}

export async function getInvoiceWithItems(id: number): Promise<InvoiceDetail | null> {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  const [party] = await db.select().from(parties).where(eq(parties.id, invoice.partyId));
  const lines = await db
    .select({
      id: invoiceItems.id,
      invoiceId: invoiceItems.invoiceId,
      itemId: invoiceItems.itemId,
      qty: invoiceItems.qty,
      rate: invoiceItems.rate,
      taxRate: invoiceItems.taxRate,
      amount: invoiceItems.amount,
      itemName: items.name,
      itemUnit: items.unit,
    })
    .from(invoiceItems)
    .innerJoin(items, eq(invoiceItems.itemId, items.id))
    .where(eq(invoiceItems.invoiceId, id));
  return { invoice, party, lines };
}

/** Delete an invoice and undo its stock movement, atomically. */
export async function deleteInvoiceWithItems(id: number): Promise<void> {
  const invoice = await getInvoice(id);
  if (!invoice) return;
  const lines = await listInvoiceItems(id);
  const sign = stockSign(invoice.type);

  db.transaction((tx) => {
    if (sign !== 0) {
      for (const l of lines) {
        // Reverse the original movement.
        tx.update(items)
          .set({ currentStock: sql`${items.currentStock} - ${sign * l.qty}` })
          .where(eq(items.id, l.itemId))
          .run();
      }
    }
    tx.delete(invoices).where(eq(invoices.id, id)).run(); // invoice_items cascade
  });
}

export interface InvoiceWithParty extends Invoice {
  partyName: string;
}

/** Invoices joined with party name — for the dashboard/list, newest first. */
export async function listInvoicesWithParty(limit?: number): Promise<InvoiceWithParty[]> {
  const q = db
    .select({
      id: invoices.id,
      type: invoices.type,
      invoiceNo: invoices.invoiceNo,
      partyId: invoices.partyId,
      date: invoices.date,
      subtotal: invoices.subtotal,
      taxTotal: invoices.taxTotal,
      discount: invoices.discount,
      grandTotal: invoices.grandTotal,
      paymentStatus: invoices.paymentStatus,
      taxMode: invoices.taxMode,
      createdAt: invoices.createdAt,
      partyName: parties.name,
    })
    .from(invoices)
    .innerJoin(parties, eq(invoices.partyId, parties.id))
    .orderBy(desc(invoices.date), desc(invoices.id));
  return limit ? q.limit(limit) : q;
}
