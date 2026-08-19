// Read-only aggregations for the Reports tab. All money stays in integer paise;
// these compose the existing services rather than issuing new raw SQL, so the
// number conventions and ledger sign rules stay in one place.

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoiceItems, invoices, items as itemsTable, parties, type Item } from '@/db/schema';
import {
  filterExpensesByRange,
  listExpenses,
  summariseExpenses,
  type CategoryTotal,
} from '@/modules/expenses/service';
import { listItems } from '@/modules/items/service';
import { listInvoicesWithParty, type InvoiceWithParty } from '@/modules/invoices/service';
import { listPartiesWithBalance, type PartyWithBalance } from '@/modules/parties/ledger';
import { getSetting } from '@/modules/settings/service';
import { lineTax, splitTax, supplyType } from '@/utils/gst';

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

// ── Sales report ──────────────────────────────────────────────────────────────
// Every total here is NET of sale returns: goods that came back were never
// really sold, and a shopkeeper asking "how much did I sell this month" is not
// asking for a figure that still counts them.
export interface SalesReport {
  from: string;
  to: string;
  count: number; // sale invoices
  subtotal: number; // net of returns
  taxTotal: number; // net of returns
  discount: number; // net of returns
  grandTotal: number; // net of returns
  rows: InvoiceWithParty[]; // the sale invoices themselves
  returnCount: number;
  returnTotal: number; // gross value of what came back
  returns: InvoiceWithParty[];
}

const sumBy = (rows: InvoiceWithParty[], pick: (r: InvoiceWithParty) => number) =>
  rows.reduce((s, r) => s + pick(r), 0);

export async function salesReport(from: string, to: string): Promise<SalesReport> {
  const all = await listInvoicesWithParty();
  const inWindow = all.filter((i) => inRange(i.date, from, to));
  const rows = inWindow.filter((i) => i.type === 'sale');
  const returns = inWindow.filter((i) => i.type === 'saleReturn');
  return {
    from,
    to,
    count: rows.length,
    subtotal: sumBy(rows, (r) => r.subtotal) - sumBy(returns, (r) => r.subtotal),
    taxTotal: sumBy(rows, (r) => r.taxTotal) - sumBy(returns, (r) => r.taxTotal),
    discount: sumBy(rows, (r) => r.discount) - sumBy(returns, (r) => r.discount),
    grandTotal: sumBy(rows, (r) => r.grandTotal) - sumBy(returns, (r) => r.grandTotal),
    rows,
    returnCount: returns.length,
    returnTotal: sumBy(returns, (r) => r.grandTotal),
    returns,
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
  saleReturnRows: InvoiceWithParty[];
  purchaseRows: InvoiceWithParty[];
}

export async function gstSummary(from: string, to: string): Promise<GstSummary> {
  const all = await listInvoicesWithParty();
  const inWindow = all.filter((i) => inRange(i.date, from, to));
  const sales = inWindow.filter((i) => i.type === 'sale');
  const returns = inWindow.filter((i) => i.type === 'saleReturn');
  const purchases = inWindow.filter((i) => i.type === 'purchase');
  // Tax charged on goods that came back was never earned, so it comes straight
  // off the output tax — otherwise the shop pays GST on a sale it refunded.
  const outputTax = sumBy(sales, (r) => r.taxTotal) - sumBy(returns, (r) => r.taxTotal);
  const inputTax = sumBy(purchases, (r) => r.taxTotal);
  return {
    from,
    to,
    taxableSales: sumBy(sales, (r) => r.subtotal) - sumBy(returns, (r) => r.subtotal),
    outputTax,
    taxablePurchases: sumBy(purchases, (r) => r.subtotal),
    inputTax,
    netPayable: outputTax - inputTax,
    salesRows: sales,
    saleReturnRows: returns,
    purchaseRows: purchases,
  };
}

// ── Profit ────────────────────────────────────────────────────────────────────
// The question a shop asks at closing time: what did today actually earn?
//
//   gross profit = what was sold (pre-tax, less any bill discount) − what it cost
//   net profit   = gross profit − the overheads paid in the same period
//
// GST is deliberately outside all of this: tax collected is the government's
// money passing through, never income. Cost comes from the snapshot written onto
// each sold line at billing time (invoice_items.cost_price), so re-pricing an
// item tomorrow cannot rewrite what last month earned.

/** One sold line, already flattened out of the join — the unit the maths works on. */
export interface ProfitLine {
  itemId: number;
  name: string;
  unit: string;
  qty: number; // thousandths
  amount: number; // paise, pre-tax sale value of the line
  costPrice: number | null; // paise/unit frozen at billing time; null on older rows
  itemPurchasePrice: number; // paise/unit, today's price — the fallback for those
}

export interface ProfitItemRow {
  itemId: number;
  name: string;
  unit: string;
  qty: number; // thousandths sold
  saleValue: number; // paise, pre-tax
  costValue: number; // paise
  profit: number; // paise
}

export interface ProfitReport {
  from: string;
  to: string;
  invoiceCount: number;
  saleValue: number; // pre-tax value of everything sold
  discount: number; // bill-level discounts given away
  netSaleValue: number; // saleValue − discount
  costValue: number;
  grossProfit: number; // netSaleValue − costValue
  expenses: number; // gross paise spent in the same range
  netProfit: number; // grossProfit − expenses
  expenseRows: CategoryTotal[]; // biggest spend first
  items: ProfitItemRow[]; // biggest earner first
  /** Lines billed before costs were recorded — valued at today's purchase price. */
  estimatedLines: number;
  /** Lines with no cost at all, which therefore read as pure profit. */
  zeroCostLines: number;
}

/** Item-wise roll-up of sold lines. Pure, so the maths is testable without a DB. */
export function summariseProfitLines(lines: ProfitLine[]): {
  items: ProfitItemRow[];
  saleValue: number;
  costValue: number;
  estimatedLines: number;
  zeroCostLines: number;
} {
  const byItem = new Map<number, ProfitItemRow>();
  let estimatedLines = 0;
  let zeroCostLines = 0;

  for (const line of lines) {
    if (line.costPrice == null) estimatedLines += 1;
    const unitCost = line.costPrice ?? line.itemPurchasePrice;
    if (unitCost <= 0) zeroCostLines += 1;
    const costValue = Math.round((line.qty * unitCost) / 1000);

    const row = byItem.get(line.itemId) ?? {
      itemId: line.itemId,
      name: line.name,
      unit: line.unit,
      qty: 0,
      saleValue: 0,
      costValue: 0,
      profit: 0,
    };
    row.qty += line.qty;
    row.saleValue += line.amount;
    row.costValue += costValue;
    row.profit = row.saleValue - row.costValue;
    byItem.set(line.itemId, row);
  }

  const items = [...byItem.values()].sort((a, b) => b.profit - a.profit);
  return {
    items,
    saleValue: items.reduce((s, r) => s + r.saleValue, 0),
    costValue: items.reduce((s, r) => s + r.costValue, 0),
    estimatedLines,
    zeroCostLines,
  };
}

/** Profit as a percentage of the sale value — 0 when nothing was sold. */
export function marginPercent(profit: number, saleValue: number): number {
  if (saleValue <= 0) return 0;
  return Math.round((profit / saleValue) * 1000) / 10;
}

export async function profitReport(from: string, to: string): Promise<ProfitReport> {
  const billed = await db
    .select({
      type: invoices.type,
      itemId: invoiceItems.itemId,
      name: itemsTable.name,
      unit: itemsTable.unit,
      qty: invoiceItems.qty,
      amount: invoiceItems.amount,
      costPrice: invoiceItems.costPrice,
      itemPurchasePrice: itemsTable.purchasePrice,
    })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .innerJoin(itemsTable, eq(invoiceItems.itemId, itemsTable.id))
    .where(
      and(
        inArray(invoices.type, ['sale', 'saleReturn']),
        gte(invoices.date, from),
        lte(invoices.date, to),
      ),
    );

  // A returned line is a sale run backwards: it takes its value AND its cost
  // back out of the period, so the item row ends up with what really stayed sold.
  const soldLines: ProfitLine[] = billed.map(({ type, ...line }) =>
    type === 'saleReturn' ? { ...line, qty: -line.qty, amount: -line.amount } : line,
  );

  const [sales, allExpenses] = await Promise.all([salesReport(from, to), listExpenses()]);
  const spend = summariseExpenses(filterExpensesByRange(allExpenses, from, to));
  const rolled = summariseProfitLines(soldLines);

  // The bill-level discount belongs to the invoice, not to any one line, so it
  // is taken off the total rather than spread across the item rows.
  const netSaleValue = rolled.saleValue - sales.discount;
  const grossProfit = netSaleValue - rolled.costValue;

  return {
    from,
    to,
    invoiceCount: sales.count,
    saleValue: rolled.saleValue,
    discount: sales.discount,
    netSaleValue,
    costValue: rolled.costValue,
    grossProfit,
    expenses: spend.total,
    netProfit: grossProfit - spend.total,
    expenseRows: spend.byCategory,
    items: rolled.items,
    estimatedLines: rolled.estimatedLines,
    zeroCostLines: rolled.zeroCostLines,
  };
}

// ── GST rate-wise breakup (the slab table a filing/CA actually asks for) ───────
export interface GstRateRow {
  taxRate: number; // basis points
  taxable: number; // paise
  tax: number; // paise
  cgst: number; // paise (intra-state half)
  sgst: number; // paise (intra-state half)
  igst: number; // paise (the whole tax, when the goods crossed a state line)
  lines: number;
}

/**
 * Taxable value and tax grouped by GST slab, split across sales and purchases.
 * Reads invoice_items directly (the invoice header only carries a single rolled-up
 * tax figure) and re-derives each line's tax from its stored pre-tax amount, so
 * the slab totals always reconcile with the invoice totals.
 *
 * Each line is split into CGST+SGST or IGST by the invoice it belongs to — the
 * place of supply frozen on that bill, against the shop's own state — so a slab
 * that holds both local and out-of-state sales reports each under the right head.
 * That is the split a return asks for; `tax` stays the sum either way.
 */
export async function gstRateBreakup(
  from: string,
  to: string,
): Promise<{ sales: GstRateRow[]; purchases: GstRateRow[] }> {
  const [rows, bizState] = await Promise.all([
    db
      .select({
        type: invoices.type,
        taxRate: invoiceItems.taxRate,
        amount: invoiceItems.amount,
        placeOfSupply: invoices.placeOfSupply,
        // Bills made before the place of supply was frozen fall back to where
        // the party lives today — the same fallback the printed invoice uses.
        partyState: parties.state,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(parties, eq(invoices.partyId, parties.id))
      .where(and(gte(invoices.date, from), lte(invoices.date, to))),
    getSetting('business_state'),
  ]);

  const group = (type: 'sale' | 'purchase'): GstRateRow[] => {
    const byRate = new Map<number, GstRateRow>();
    for (const r of rows) {
      // A sale return belongs in the sales slab it reverses, with the sign
      // flipped — that is what makes the slab table add up to the summary.
      const isReturn = type === 'sale' && r.type === 'saleReturn';
      if (r.type !== type && !isReturn) continue;
      const sign = isReturn ? -1 : 1;
      const entry = byRate.get(r.taxRate) ?? {
        taxRate: r.taxRate,
        taxable: 0,
        tax: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        lines: 0,
      };
      const tax = sign * lineTax(r.amount, r.taxRate);
      const split = splitTax(tax, supplyType(bizState, r.placeOfSupply || r.partyState));
      entry.taxable += sign * r.amount;
      entry.tax += tax;
      entry.cgst += split.cgst;
      entry.sgst += split.sgst;
      entry.igst += split.igst;
      entry.lines += 1;
      byRate.set(r.taxRate, entry);
    }
    return [...byRate.values()].sort((a, b) => a.taxRate - b.taxRate);
  };

  return { sales: group('sale'), purchases: group('purchase') };
}
