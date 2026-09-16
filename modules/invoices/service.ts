import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { atomic, type Statement, type Tx } from '@/db/atomic';
import { db } from '@/db/client';
import {
  invoiceItems,
  invoices,
  items,
  parties,
  payments,
  type Invoice,
  type InvoiceItem,
  type NewInvoice,
  type NewInvoiceItem,
  type Party,
} from '@/db/schema';
import { recomputeInvoiceStatus } from '@/modules/payments/service';
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
  /** What the goods cost us, paise per unit. Defaults to the item's purchase
   *  price on a sale, and to the pre-tax rate being paid on a purchase. */
  costPrice?: number;
  /** Money knocked off this line alone, paise. Taken off before tax — see
   *  utils/gst computeLine — so the stored `amount` is already net of it. */
  discount?: number;
  /** Basis points when the line discount was typed as "10%" rather than in
   *  rupees; the paise are then derived from it and stored alongside. */
  discountPercent?: number | null;
}

/**
 * Pre-tax cost of ONE unit, from a line's pre-tax total and its quantity —
 * `amount` already has any inclusive GST backed out of it (see utils/gst), which
 * is what makes this comparable with the pre-tax sale value the profit report
 * comes from. A zero quantity has no meaningful unit cost.
 */
export function unitCostFrom(amount: number, qty: number): number {
  if (qty <= 0) return 0;
  return Math.round((amount * 1000) / qty);
}

export interface InvoiceHeaderInput {
  type: InvoiceType;
  partyId: number;
  date: string; // ISO 'YYYY-MM-DD'
  discount?: number; // paise
  /** Basis points when the bill discount was typed as a percentage. It decides
   *  the paise above, and is stored so a reprint still names the percentage. */
  discountPercent?: number | null;
  paymentStatus?: Invoice['paymentStatus'];
  taxMode?: TaxMode; // default 'exclusive' — see utils/gst
  dueDate?: string | null; // ISO day; null = due immediately
  placeOfSupply?: string | null; // Indian state; null = fall back to the party's
  /**
   * The document this one comes off: the sale a credit note gives back, or the
   * quotation a sale was converted from. Which of the two it means is told by
   * the type of the row that holds it — see RETURN_TYPES/BILL_TYPES below.
   */
  sourceInvoiceId?: number | null;
}

/**
 * The percentage worth keeping on a row, or NULL. Nothing and 0% are the same
 * thing here: the column means "this discount was typed as a percentage", and a
 * zero never was one — storing it would make every undiscounted bill claim to
 * have been given 0% off.
 */
const storedPercent = (percent?: number | null): number | null =>
  percent != null && percent > 0 ? percent : null;

// Stock direction: goods leave on a sale and on a purchase return (−), and come
// in on a purchase and a sale return (+); quotations/challans don't move stock.
export function stockSign(type: InvoiceType): -1 | 0 | 1 {
  if (type === 'sale' || type === 'purchaseReturn') return -1;
  if (type === 'purchase' || type === 'saleReturn') return 1;
  return 0;
}

/**
 * The two documents that only promise goods. Neither moves stock nor money, so
 * neither is worth anything to the books until it is turned into a real bill.
 */
export function isConvertible(type: InvoiceType): boolean {
  return type === 'quotation' || type === 'challan';
}

// `source_invoice_id` carries two different meanings, and they are told apart by
// the TYPE of the row holding it, never by guessing: a credit/debit note names
// the bill it reverses, a sale/purchase names the quotation or challan it was
// converted from. Reading the column without the type would make a converted
// sale look like a return raised against its own quotation.
const RETURN_TYPES: InvoiceType[] = ['saleReturn', 'purchaseReturn'];
const BILL_TYPES: InvoiceType[] = ['sale', 'purchase'];

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

  // The cost of the goods, frozen at billing time. Re-pricing an item next month
  // must not change what a bill already given to a customer earned — so the
  // profit report reads this column, not the item's price of the day.
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const priceRows = itemIds.length
    ? await db
        .select({ id: items.id, purchasePrice: items.purchasePrice, hsnCode: items.hsnCode })
        .from(items)
        .where(inArray(items.id, itemIds))
    : [];
  const purchasePriceOf = new Map(priceRows.map((r) => [r.id, r.purchasePrice]));
  // The HSN is copied down too: a tax invoice has to reprint identically years
  // later, even after the item is reclassified.
  const hsnOf = new Map(priceRows.map((r) => [r.id, r.hsnCode]));

  // Where the goods were supplied, frozen now: it decides CGST+SGST vs IGST on
  // the printed bill, and a party who moves house years later must not change
  // the tax on a bill already issued.
  const [buyer] = await db
    .select({ state: parties.state })
    .from(parties)
    .where(eq(parties.id, header.partyId));
  const placeOfSupply = header.placeOfSupply ?? buyer?.state ?? null;

  const taxMode: TaxMode = header.taxMode ?? 'exclusive';
  const { lines: computed, totals } = computeTotals(
    lines,
    header.discount ?? 0,
    taxMode,
    header.discountPercent,
  );
  const sign = stockSign(header.type);
  const isPurchase = header.type === 'purchase';
  // On a purchase the rate paid IS the cost; on everything else it's what the
  // stock cost the last time the item was priced.
  const costOf = (l: InvoiceLineInput, i: number): number =>
    l.costPrice ?? (isPurchase ? unitCostFrom(computed[i].amount, l.qty) : purchasePriceOf.get(l.itemId) ?? 0);

  return atomic(function* (tx) {
    const [inv]: Invoice[] = yield tx
      .insert(invoices)
      .values({
        type: header.type,
        invoiceNo,
        partyId: header.partyId,
        date: header.date,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discount: totals.discount,
        discountPercent: storedPercent(header.discountPercent),
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        paymentStatus: header.paymentStatus ?? 'unpaid',

        taxMode,
        dueDate: header.dueDate ?? null,
        placeOfSupply,
        // Written so the bill knows what has already come back on it — without
        // this a single sale could be returned again and again.
        sourceInvoiceId: header.sourceInvoiceId ?? null,
      })
      .returning();

    yield* writeLines(tx, inv.id, lines, computed, { sign, isPurchase, costOf, hsnOf });
    return inv;
  });
}

/**
 * Write a document's lines and move the stock they represent. Shared by create
 * and edit so the two can never drift apart on cost, HSN or stock direction.
 * A step of an atomic() body — see db/atomic.
 */
function* writeLines(
  tx: Tx,
  invoiceId: number,
  lines: InvoiceLineInput[],
  computed: { amount: number; discount: number }[],

  ctx: {
    sign: -1 | 0 | 1;
    isPurchase: boolean;
    costOf: (l: InvoiceLineInput, i: number) => number;
    hsnOf: Map<number, string | null>;
  },
): Generator<Statement, void, unknown[]> {
  for (const [i, l] of lines.entries()) {
    const cost = ctx.costOf(l, i);
    yield tx
      .insert(invoiceItems)
      .values({
        invoiceId,
        itemId: l.itemId,
        qty: l.qty,
        rate: l.rate,
        taxRate: l.taxRate,
        amount: computed[i].amount,
        costPrice: cost,
        // The capped discount, not what was typed: the line can never be given
        // away for less than nothing.
        discount: computed[i].discount,
        discountPercent: storedPercent(l.discountPercent),
        hsnCode: ctx.hsnOf.get(l.itemId) ?? null,

      });
    if (ctx.sign === 0) continue;
    // Buying the goods is also the moment we learn what they now cost, so a
    // purchase carries the new price back onto the item — the next sale is then
    // measured against what was actually paid, not last season's rate. A
    // free/zero line is never allowed to wipe a real price.
    yield tx
      .update(items)
      .set({
        currentStock: sql`${items.currentStock} + ${ctx.sign * l.qty}`,
        ...(ctx.isPurchase && cost > 0 ? { purchasePrice: cost } : {}),
      })
      .where(eq(items.id, l.itemId));
  }
}

/**
 * What one line of an EDITED document costs us.
 *
 * The order matters, and it is the whole reason profit survives an edit:
 *   1. a cost handed in explicitly (a sale return carries the original one);
 *   2. on a purchase, the rate being paid — there the rate IS the cost, so a
 *      corrected rate is a corrected cost;
 *   3. the cost frozen when this bill was first made, for an item that was
 *      already on it — editing a sale today must not re-price what it earned;
 *   4. only for a line that is genuinely new: what the item costs today.
 */
export function editedLineCost(args: {
  explicit?: number;
  isPurchase: boolean;
  amount: number; // pre-tax line total, paise
  qty: number; // thousandths
  frozen?: number | null;
  current?: number | null;
}): number {
  if (args.explicit != null) return args.explicit;
  if (args.isPurchase) return unitCostFrom(args.amount, args.qty);
  return args.frozen ?? args.current ?? 0;
}

/**
 * Edit a saved document: its lines are replaced wholesale and the stock they
 * had moved is put back first, so the shelf ends up holding exactly what the
 * new lines say. Atomic — a failure halfway leaves the old bill untouched.
 *
 * What deliberately does NOT change:
 *   • the invoice number and the document type — a bill that has been handed to
 *     a customer keeps its identity;
 *   • the cost frozen on a line that is still on the bill, so editing a sale
 *     today cannot rewrite the profit it earned when it was made. (A purchase
 *     is the exception: there the rate IS the cost, so a corrected rate is a
 *     corrected cost.)
 *
 * The payment status is recomputed at the end — dropping the total below what
 * has already been received leaves the invoice fully paid, and the excess shows
 * up in the party's ledger as money owed back.
 */
export async function updateInvoiceWithItems(
  id: number,
  header: Omit<InvoiceHeaderInput, 'type'>,
  lines: InvoiceLineInput[],
): Promise<Invoice> {
  const existing = await getInvoice(id);
  if (!existing) throw new Error('That document no longer exists.');
  const oldLines = await listInvoiceItems(id);

  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const priceRows = itemIds.length
    ? await db
        .select({ id: items.id, purchasePrice: items.purchasePrice, hsnCode: items.hsnCode })
        .from(items)
        .where(inArray(items.id, itemIds))
    : [];
  const purchasePriceOf = new Map(priceRows.map((r) => [r.id, r.purchasePrice]));
  const hsnOf = new Map(priceRows.map((r) => [r.id, r.hsnCode]));
  // What each item cost when this bill was first made.
  const frozenCostOf = new Map(oldLines.map((l) => [l.itemId, l.costPrice]));

  // Fields the edit form does not carry are preserved, not blanked. The place of
  // supply is only re-derived when the bill is moved to a different party.
  const partyChanged = header.partyId !== existing.partyId;
  const [newBuyer] = partyChanged
    ? await db.select({ state: parties.state }).from(parties).where(eq(parties.id, header.partyId))
    : [];
  const placeOfSupply =
    header.placeOfSupply !== undefined
      ? header.placeOfSupply
      : partyChanged
        ? newBuyer?.state ?? null
        : existing.placeOfSupply;
  const dueDate = header.dueDate !== undefined ? header.dueDate : existing.dueDate;

  const taxMode: TaxMode = header.taxMode ?? existing.taxMode;
  const { lines: computed, totals } = computeTotals(
    lines,
    header.discount ?? 0,
    taxMode,
    header.discountPercent,
  );
  const sign = stockSign(existing.type);
  const isPurchase = existing.type === 'purchase';
  const costOf = (l: InvoiceLineInput, i: number): number =>
    editedLineCost({
      explicit: l.costPrice,
      isPurchase,
      amount: computed[i].amount,
      qty: l.qty,
      frozen: frozenCostOf.get(l.itemId),
      current: purchasePriceOf.get(l.itemId),
    });

  await atomic(function* (tx) {
    // Put back the stock the old lines had moved, then start again.
    if (sign !== 0) {
      for (const l of oldLines) {
        yield tx
          .update(items)
          .set({ currentStock: sql`${items.currentStock} - ${sign * l.qty}` })
          .where(eq(items.id, l.itemId));
      }
    }
    yield tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

    yield tx
      .update(invoices)
      .set({
        partyId: header.partyId,
        date: header.date,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discount: totals.discount,
        discountPercent: storedPercent(header.discountPercent),
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        taxMode,

        dueDate,
        placeOfSupply,
      })
      .where(eq(invoices.id, id));

    yield* writeLines(tx, id, lines, computed, { sign, isPurchase, costOf, hsnOf });
  });

  await recomputeInvoiceStatus(id);
  const updated = await getInvoice(id);
  if (!updated) throw new Error('The document could not be reloaded after saving.');
  return updated;
}

/**
 * The credit/debit notes raised against one document, and what they add up to.
 *
 * A partial return is normal — half a crate comes back, the rest is kept — so
 * this does not block a second one. It exists so the shop can SEE what has
 * already gone back before writing another, and so the app can say something
 * when the returns start to exceed the bill itself.
 */
export async function returnsAgainst(invoiceId: number): Promise<Invoice[]> {
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.sourceInvoiceId, invoiceId), inArray(invoices.type, RETURN_TYPES)))
    .orderBy(invoices.date, invoices.id);
}

/**
 * The bill a quotation or challan became, if it has already been converted.
 *
 * A promise can only be billed once: a second sale for the same promised goods
 * would take the same stock off the shelf twice and ask the customer to pay for
 * it twice, so this is what the convert path checks before writing anything.
 */
export async function convertedFrom(sourceId: number): Promise<Invoice | undefined> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.sourceInvoiceId, sourceId), inArray(invoices.type, BILL_TYPES)));
  return row;
}

/**
 * The quotation or challan a bill was converted from — the same link read the
 * other way, so a sale can name where it came from. Undefined for a bill typed
 * in from scratch, and for a credit note, where the column means the sale being
 * given back rather than a promise being kept.
 */
export async function sourceDocument(invoice: Invoice): Promise<Invoice | undefined> {
  if (invoice.sourceInvoiceId == null) return undefined;
  const source = await getInvoice(invoice.sourceInvoiceId);
  return source && isConvertible(source.type) ? source : undefined;
}

/**
 * Turn a quotation or a delivery challan into a real sale.
 *
 * The promise itself is left alone — it stays as the record of what was offered
 * — and a brand new sale is written through the ordinary create path, so it
 * gets its own sale number, its own stock movement and, above all, TODAY's cost
 * frozen on every line. A quotation given last month must not carry last
 * month's cost: the goods leave the shelf now, and that is what this sale
 * earned. Only what was agreed with the customer is copied across — the party,
 * the rates, the tax basis and the discounts.
 */
export async function convertToInvoice(id: number): Promise<Invoice> {
  const source = await getInvoice(id);
  if (!source) throw new Error('That document no longer exists.');
  if (!isConvertible(source.type)) {
    throw new Error('Only a quotation or a delivery challan can be turned into a bill.');
  }
  const already = await convertedFrom(id);
  if (already) {
    throw new Error(`${source.invoiceNo} has already become bill ${already.invoiceNo}.`);
  }
  const lines = await listInvoiceItems(id);

  return createInvoiceWithItems(
    {
      type: 'sale',
      partyId: source.partyId,
      // The goods move today, whatever day the quotation was written.
      date: new Date().toISOString().slice(0, 10),
      discount: source.discount,
      discountPercent: source.discountPercent,
      taxMode: source.taxMode,
      // Nothing is owed on any particular day yet; credit is given, if at all,
      // once the bill exists.
      dueDate: null,
      // A quotation was priced for a place of supply; the tax must not change
      // just because the customer has since moved.
      placeOfSupply: source.placeOfSupply,
      sourceInvoiceId: source.id,
    },
    // No costPrice is passed on purpose: the create path takes a fresh snapshot
    // from the item, which is what the goods cost the shop today.
    lines.map((l) => ({
      itemId: l.itemId,
      qty: l.qty,
      rate: l.rate,
      taxRate: l.taxRate,
      discount: l.discount,
      discountPercent: l.discountPercent,
    })),
  );
}

/** Paise already returned against a document. */
export async function returnedTotal(invoiceId: number, excludeId?: number): Promise<number> {
  const rows = await returnsAgainst(invoiceId);
  return rows.reduce((s, r) => (r.id === excludeId ? s : s + r.grandTotal), 0);
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
      costPrice: invoiceItems.costPrice,
      discount: invoiceItems.discount,
      discountPercent: invoiceItems.discountPercent,
      hsnCode: invoiceItems.hsnCode,
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

  await atomic(function* (tx) {
    if (sign !== 0) {
      for (const l of lines) {
        // Reverse the original movement.
        yield tx
          .update(items)
          .set({ currentStock: sql`${items.currentStock} - ${sign * l.qty}` })
          .where(eq(items.id, l.itemId));
      }
    }
    // Payments carry a real FK to the invoice with no cascade, so a paid bill
    // cannot be deleted while its receipt still points at it. Take the receipt
    // with the bill: that money was only ever recorded because of this
    // document, and leaving it behind as an on-account credit would put an
    // advance on the party's ledger that nobody ever handed them.
    yield tx.delete(payments).where(eq(payments.invoiceId, id));
    yield tx.delete(invoices).where(eq(invoices.id, id)); // invoice_items cascade
  });
}

/**
 * What else goes when this document is deleted — so the confirmation can say it
 * out loud instead of the shop finding out afterwards. `returns` are the credit
 * or debit notes raised against this bill; they are NOT deleted (each holds its
 * own stock and money), they simply stop naming the bill they reverse.
 */
export interface DeletionImpact {
  paymentCount: number;
  paymentTotal: number; // paise
  returnCount: number;
}

export async function deletionImpact(id: number): Promise<DeletionImpact> {
  const [linked, notes] = await Promise.all([
    db.select().from(payments).where(eq(payments.invoiceId, id)),
    returnsAgainst(id),
  ]);
  return {
    paymentCount: linked.length,
    paymentTotal: linked.reduce((sum, p) => sum + p.amount, 0),
    returnCount: notes.length,
  };
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
      discountPercent: invoices.discountPercent,
      grandTotal: invoices.grandTotal,
      paymentStatus: invoices.paymentStatus,
      taxMode: invoices.taxMode,
      dueDate: invoices.dueDate,
      placeOfSupply: invoices.placeOfSupply,
      roundOff: invoices.roundOff,
      sourceInvoiceId: invoices.sourceInvoiceId,
      createdAt: invoices.createdAt,
      partyName: parties.name,
    })
    .from(invoices)
    .innerJoin(parties, eq(invoices.partyId, parties.id))
    .orderBy(desc(invoices.date), desc(invoices.id));
  return limit ? q.limit(limit) : q;
}
