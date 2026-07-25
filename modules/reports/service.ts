// Read-only aggregations for the Reports tab. All money stays in integer paise;
// these compose the existing services rather than issuing new raw SQL, so the
// number conventions and ledger sign rules stay in one place.

import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoiceItems, invoices, type Item } from '@/db/schema';
import { listItems } from '@/modules/items/service';
import { listInvoicesWithParty, type InvoiceWithParty } from '@/modules/invoices/service';
import { listPartiesWithBalance, type PartyWithBalance } from '@/modules/parties/ledger';
import { lineTax } from '@/utils/gst';

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

// ── Sales report ──────────────────────────────────────────────────────────────
export interface SalesReport {
  from: string;
  to: string;
  count: number;
  subtotal: number;
  taxTotal: number;
  discount: number;
  grandTotal: number;
  rows: InvoiceWithParty[];
}

export async function salesReport(from: string, to: string): Promise<SalesReport> {
  const all = await listInvoicesWithParty();
  const rows = all.filter((i) => i.type === 'sale' && inRange(i.date, from, to));
  return {
    from,
    to,
    count: rows.length,
    subtotal: rows.reduce((s, r) => s + r.subtotal, 0),
    taxTotal: rows.reduce((s, r) => s + r.taxTotal, 0),
    discount: rows.reduce((s, r) => s + r.discount, 0),
    grandTotal: rows.reduce((s, r) => s + r.grandTotal, 0),
    rows,
  };
}

// ── Party outstanding ─────────────────────────────────────────────────────────
export interface Outstanding {
  receivables: PartyWithBalance[]; // parties who owe you (balance > 0)
  payables: PartyWithBalance[]; // parties you owe (balance < 0)
  totalReceivable: number;
  totalPayable: number;
}

export async function partyOutstanding(): Promise<Outstanding> {
  const all = await listPartiesWithBalance();
  const receivables = all
    .filter((p) => p.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const payables = all
    .filter((p) => p.balance < 0)
    .sort((a, b) => a.balance - b.balance);
  return {
    receivables,
    payables,
    totalReceivable: receivables.reduce((s, p) => s + p.balance, 0),
    totalPayable: payables.reduce((s, p) => s + -p.balance, 0),
  };
}

// ── Stock summary ─────────────────────────────────────────────────────────────
export interface StockRow {
  item: Item;
  stockValue: number; // paise, valued at purchase price
}
export interface StockSummary {
  rows: StockRow[];
  totalValue: number;
  totalItems: number;
  lowStockCount: number; // items at or below zero stock
}

export async function stockSummary(): Promise<StockSummary> {
  const items = await listItems();
  const rows: StockRow[] = items.map((item) => ({
    item,
    // currentStock is thousandths, purchasePrice is paise/unit.
    stockValue: Math.round((item.currentStock * item.purchasePrice) / 1000),
  }));
  return {
    rows,
    totalValue: rows.reduce((s, r) => s + r.stockValue, 0),
    totalItems: items.length,
    lowStockCount: items.filter((i) => i.currentStock <= 0).length,
  };
}

// ── GST summary (basic GSTR-style) ────────────────────────────────────────────
export interface GstSummary {
  from: string;
  to: string;
  taxableSales: number; // pre-tax sale value
  outputTax: number; // GST collected on sales
  taxablePurchases: number; // pre-tax purchase value
  inputTax: number; // GST paid on purchases (input credit)
  netPayable: number; // outputTax − inputTax
  /** Invoice-level detail, kept for the Excel export (and any future drill-down). */
  salesRows: InvoiceWithParty[];
  purchaseRows: InvoiceWithParty[];
}

export async function gstSummary(from: string, to: string): Promise<GstSummary> {
  const all = await listInvoicesWithParty();
  const sales = all.filter((i) => i.type === 'sale' && inRange(i.date, from, to));
  const purchases = all.filter((i) => i.type === 'purchase' && inRange(i.date, from, to));
  const outputTax = sales.reduce((s, r) => s + r.taxTotal, 0);
  const inputTax = purchases.reduce((s, r) => s + r.taxTotal, 0);
  return {
    from,
    to,
    taxableSales: sales.reduce((s, r) => s + r.subtotal, 0),
    outputTax,
    taxablePurchases: purchases.reduce((s, r) => s + r.subtotal, 0),
    inputTax,
    netPayable: outputTax - inputTax,
    salesRows: sales,
    purchaseRows: purchases,
  };
}

// ── GST rate-wise breakup (the slab table a filing/CA actually asks for) ───────
export interface GstRateRow {
  taxRate: number; // basis points
  taxable: number; // paise
  tax: number; // paise
  cgst: number; // paise (intra-state split — half of tax)
  sgst: number; // paise
  lines: number;
}

/**
 * Taxable value and tax grouped by GST slab, split across sales and purchases.
 * Reads invoice_items directly (the invoice header only carries a single rolled-up
 * tax figure) and re-derives each line's tax from its stored pre-tax amount, so
 * the slab totals always reconcile with the invoice totals.
 */
export async function gstRateBreakup(
  from: string,
  to: string,
): Promise<{ sales: GstRateRow[]; purchases: GstRateRow[] }> {
  const rows = await db
    .select({
      type: invoices.type,
      taxRate: invoiceItems.taxRate,
      amount: invoiceItems.amount,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(and(gte(invoices.date, from), lte(invoices.date, to)));

  const group = (type: 'sale' | 'purchase'): GstRateRow[] => {
    const byRate = new Map<number, GstRateRow>();
    for (const r of rows) {
      if (r.type !== type) continue;
      const entry = byRate.get(r.taxRate) ?? {
        taxRate: r.taxRate,
        taxable: 0,
        tax: 0,
        cgst: 0,
        sgst: 0,
        lines: 0,
      };
      entry.taxable += r.amount;
      entry.tax += lineTax(r.amount, r.taxRate);
      entry.lines += 1;
      byRate.set(r.taxRate, entry);
    }
    return [...byRate.values()]
      .map((e) => ({ ...e, cgst: Math.round(e.tax / 2), sgst: e.tax - Math.round(e.tax / 2) }))
      .sort((a, b) => a.taxRate - b.taxRate);
  };

  return { sales: group('sale'), purchases: group('purchase') };
}
