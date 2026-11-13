// Excel (.xlsx) export for every report, using the dependency-free writer in
// utils/xlsx. Each export builds a workbook, drops it in cache storage and hands
// it to the OS share sheet — so it can go to WhatsApp, Drive, Gmail or the CA in
// one tap, with no server and no internet.
//
// Each report is first built as a ReportBook — title, period line and sheets —
// and that one book is what both the Excel export and the PDF (modules/reports/
// pdf.ts) print, so the two can never disagree about a figure.
//
// Money is exported as RUPEE NUMBERS (paise ÷ 100), never as pre-formatted
// strings: the whole point of Excel is that the accountant can sum the column.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSetting } from '@/modules/settings/service';
import { accountBook } from '@/modules/bankAccounts/ledger';
import { STOCK_LABEL } from '@/modules/items/stockLevel';
import { agingReport, AGING_BUCKETS, type AgingSide } from '@/modules/reports/aging';
import { dayBook, DAY_BOOK_LABEL } from '@/modules/reports/daybook';
import {
  gstRateBreakup,
  gstSummary,
  itemSalesReport,
  marginPercent,
  partyOutstanding,
  percentOf,
  profitReport,
  purchaseReport,
  salesReport,
  stockSummary,
} from '@/modules/reports/service';
import { buildXlsx, type SheetSpec } from '@/utils/xlsx';
import { formatDate, formatTaxRate } from '@/utils/format';
import { downloadFile, isWeb } from '@/utils/webFile';
import type { InvoiceWithParty } from '@/modules/invoices/service';

/** paise → a plain number in rupees, rounded to 2 dp (Excel-summable). */
const money = (paise: number): number => Math.round(paise) / 100;

/** thousandths → plain unit number. */
const qty = (thousandths: number): number => Math.round(thousandths) / 1000;

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partly paid',
  unpaid: 'Unpaid',
};

/**
 * One report, ready to print or export: what it is called, the period line, and
 * its tables. Sheets carry no preamble — the business header is added by
 * whichever format the book goes out in.
 */
export interface ReportBook {
  title: string;
  /** "Period: 1 Apr 2026 to 30 Apr 2026", "As of: …" — already worded. */
  subtitle?: string;
  /** File name without extension. */
  filename: string;
  sheets: SheetSpec[];
}

/** The shop's name and GSTIN, as every report heads itself. */
export async function reportBusiness(): Promise<{ name: string; gstin: string | null }> {
  const [name, gstin] = await Promise.all([getSetting('business_name'), getSetting('business_gstin')]);
  return { name: name || 'Billing App', gstin: gstin || null };
}

const periodLine = (from: string, to: string) => `Period: ${formatDate(from)} to ${formatDate(to)}`;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Write the workbook to cache and open the share sheet. Returns the file uri. */
async function shareWorkbook(sheets: SheetSpec[], filename: string): Promise<string> {
  // A browser has no cache folder or share sheet: the workbook is downloaded.
  if (isWeb) {
    downloadFile(filename, buildXlsx(sheets), XLSX_MIME);
    return filename;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(buildXlsx(sheets));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: filename,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
  return file.uri;
}

/** A book as an .xlsx: the business header goes above the first sheet. */
export async function shareBookExcel(book: ReportBook): Promise<string> {
  const biz = await reportBusiness();
  const preamble = [biz.name, book.title];
  if (biz.gstin) preamble.push(`GSTIN: ${biz.gstin}`);
  if (book.subtitle) preamble.push(book.subtitle);
  const sheets = book.sheets.map((s, i) => (i === 0 ? { ...s, preamble } : s));
  return shareWorkbook(sheets, `${book.filename}.xlsx`);
}

const stamp = (from?: string, to?: string) => (from && to ? `_${from}_to_${to}` : '');

// ── Invoice list sheet, reused by the sales and GST exports ───────────────────
function invoiceSheet(name: string, rows: InvoiceWithParty[]): SheetSpec {
  return {
    name,
    columns: [
      { header: 'Invoice No', width: 20 },
      { header: 'Date', width: 12 },
      { header: 'Party', width: 26 },
      { header: 'Taxable value', width: 15, money: true },
      { header: 'GST', width: 13, money: true },
      { header: 'Discount', width: 12, money: true },
      { header: 'Total', width: 15, money: true },
      { header: 'Rate basis', width: 13 },
      { header: 'Status', width: 12 },
    ],
    rows: rows.map((r) => [
      r.invoiceNo,
      r.date,
      r.partyName,
      money(r.subtotal),
      money(r.taxTotal),
      money(r.discount),
      money(r.grandTotal),
      r.taxMode === 'inclusive' ? 'Tax included' : 'Tax extra',
      STATUS_LABEL[r.paymentStatus] ?? r.paymentStatus,
    ]),
    totals: [
      'TOTAL',
      '',
      `${rows.length} invoice(s)`,
      money(rows.reduce((s, r) => s + r.subtotal, 0)),
      money(rows.reduce((s, r) => s + r.taxTotal, 0)),
      money(rows.reduce((s, r) => s + r.discount, 0)),
      money(rows.reduce((s, r) => s + r.grandTotal, 0)),
      '',
      '',
    ],
  };
}

function rateSheet(name: string, rows: Awaited<ReturnType<typeof gstRateBreakup>>['sales']): SheetSpec {
  return {
    name,
    columns: [
      { header: 'GST rate', width: 12 },
      { header: 'Lines', width: 10 },
      { header: 'Taxable value', width: 16, money: true },
      { header: 'CGST', width: 13, money: true },
      { header: 'SGST', width: 13, money: true },
      // Zero for a shop that only ever sells locally, but the accountant's
      // sheet keeps the same shape either way.
      { header: 'IGST', width: 13, money: true },
      { header: 'Total GST', width: 14, money: true },
    ],
    rows: rows.map((r) => [
      formatTaxRate(r.taxRate),
      r.lines,
      money(r.taxable),
      money(r.cgst),
      money(r.sgst),
      money(r.igst),
      money(r.tax),
    ]),
    totals: [
      'TOTAL',
      rows.reduce((s, r) => s + r.lines, 0),
      money(rows.reduce((s, r) => s + r.taxable, 0)),
      money(rows.reduce((s, r) => s + r.cgst, 0)),
      money(rows.reduce((s, r) => s + r.sgst, 0)),
      money(rows.reduce((s, r) => s + r.igst, 0)),
      money(rows.reduce((s, r) => s + r.tax, 0)),
    ],
  };
}


// ── Report books, one per report screen ───────────────────────────────────────

/** The purchase side: the bills, and a sheet of who the money went to. */
export async function purchaseReportBook(from: string, to: string): Promise<ReportBook> {
  const report = await purchaseReport(from, to);
  const sheets: SheetSpec[] = [invoiceSheet('Purchases', report.rows)];
  // Debit notes get their own sheet rather than negative rows among the bills:
  // the accountant wants them as documents in their own right.
  if (report.returns.length) sheets.push(invoiceSheet('Purchase returns', report.returns));
  if (report.suppliers.length) {
    sheets.push({
      name: 'By supplier',
      columns: [
        { header: 'Supplier', width: 28 },
        { header: 'Bills', width: 10 },
        { header: 'Share %', width: 10 },
        { header: 'Total', width: 16, money: true },
      ],
      rows: report.suppliers.map((s) => [
        s.partyName,
        s.count,
        percentOf(s.total, report.grandTotal),
        money(s.total),
      ]),
      totals: ['TOTAL', report.count, 100, money(report.grandTotal)],
    });
  }
  return {
    title: 'Purchase Report',
    subtitle: periodLine(from, to),
    filename: `purchase-report${stamp(from, to)}`,
    sheets,
  };
}

/** What moved off the shelf, biggest first — quantity and value, net of returns. */
export async function itemSalesBook(from: string, to: string): Promise<ReportBook> {
  const report = await itemSalesReport(from, to);
  return {
    title: 'Item-wise Sales',
    subtitle: periodLine(from, to),
    filename: `item-sales${stamp(from, to)}`,
    sheets: [
      {
        name: 'Item-wise sales',
        columns: [
          { header: 'Item', width: 30 },
          { header: 'Unit', width: 10 },
          { header: 'Quantity', width: 14 },
          { header: 'Bills', width: 10 },
          { header: 'Share %', width: 10 },
          { header: 'Sale value', width: 16, money: true },
        ],
        rows: report.rows.map((r) => [
          r.name,
          r.unit,
          qty(r.qty),
          r.bills,
          percentOf(r.saleValue, report.totalValue),
          money(r.saleValue),
        ]),
        totals: ['TOTAL', '', '', '', 100, money(report.totalValue)],
      },
    ],
  };
}

/**
 * One day, as the shop lived it. The cash column is the point: a credit sale is
 * on the page but contributes nothing to it, so the sheet cannot be read as
 * takings the shop never received.
 */
export async function dayBookBook(day: string): Promise<ReportBook> {
  const book = await dayBook(day);
  return {
    title: 'Day Book',
    subtitle: `Day: ${formatDate(day)}`,
    filename: `day-book-${day}`,
    sheets: [
      {
        name: 'Day book',
        columns: [
          { header: 'Type', width: 14 },
          { header: 'Reference', width: 20 },
          { header: 'With', width: 28 },
          { header: 'Cash', width: 10 },
          { header: 'Amount', width: 16, money: true },
        ],
        rows: book.entries.map((e) => [
          DAY_BOOK_LABEL[e.kind],
          e.title,
          e.sub,
          e.cash ? 'Yes' : 'Credit',
          money(e.amount),
        ]),
        totals: ['NET CASH', '', '', '', money(book.summary.netCash)],
      },
      {
        name: 'Summary',
        columns: [
          { header: 'Particulars', width: 30 },
          { header: 'Amount', width: 16, money: true },
        ],
        rows: [
          ['Cash received', money(book.summary.cashIn)],
          ['Cash paid out', money(book.summary.cashOut)],
          ['', ''],
          ['Sales billed (incl. credit)', money(book.summary.salesBilled)],
          ['Sale returns billed', money(book.summary.returnsBilled)],
          ['Purchases billed (incl. credit)', money(book.summary.purchasesBilled)],
          ['Expenses', money(book.summary.expenses)],
        ],
        totals: ['NET CASH', money(book.summary.netCash)],
      },
    ],
  };
}

export async function salesReportBook(from: string, to: string): Promise<ReportBook> {
  const report = await salesReport(from, to);
  const sheets = [invoiceSheet('Sales', report.rows)];
  // Returns get their own sheet rather than negative rows among the sales: the
  // accountant wants to see the credit notes as documents in their own right.
  if (report.returns.length) sheets.push(invoiceSheet('Sale returns', report.returns));
  return {
    title: 'Sales Report',
    subtitle: periodLine(from, to),
    filename: `sales-report${stamp(from, to)}`,
    sheets,
  };
}

/**
 * The chase list (or the pay list), oldest money to the right. One row per
 * party, with the columns adding across to the party's balance and down to the
 * report total — so the accountant's copy says exactly what the screen says.
 */
export async function agingBook(side: AgingSide = 'receivable'): Promise<ReportBook> {
  const data = await agingReport(undefined, side);
  const payable = side === 'payable';
  return {
    title: payable ? 'Payables Aging' : 'Receivables Aging',
    subtitle: `As of: ${formatDate(data.asOf)}`,
    filename: payable ? 'payables-aging-report' : 'aging-report',
    sheets: [
      {
        name: payable ? 'Payables aging' : 'Aging',
        columns: [
          { header: 'Party', width: 28 },
          { header: 'Phone', width: 16 },
          { header: 'Oldest (days)', width: 14 },
          ...AGING_BUCKETS.map((b) => ({ header: b.label, width: 15, money: true })),
          { header: 'Total', width: 16, money: true },
        ],
        rows: data.rows.map((r) => [
          r.party.name,
          r.party.phone ?? '',
          r.oldestDays,
          ...r.buckets.map(money),
          money(r.total),
        ]),
        totals: ['TOTAL', '', '', ...data.buckets.map(money), money(data.total)],
      },
    ],
  };
}

export async function outstandingBook(): Promise<ReportBook> {
  const data = await partyOutstanding();
  const columns = [
    { header: 'Party', width: 28 },
    { header: 'Type', width: 12 },
    { header: 'Phone', width: 16 },
    { header: 'City', width: 16 },
    { header: 'Amount', width: 16, money: true },
  ];

  return {
    title: 'Outstanding Report',
    filename: 'outstanding-report',
    sheets: [
      {
        name: 'To collect',
        columns,
        rows: data.receivables.map(({ party, balance }) => [
          party.name,
          party.type === 'customer' ? 'Customer' : 'Supplier',
          party.phone ?? '',
          party.city ?? '',
          money(balance),
        ]),
        totals: ['TOTAL RECEIVABLE', '', '', '', money(data.totalReceivable)],
      },
      {
        name: 'To pay',
        columns,
        rows: data.payables.map(({ party, balance }) => [
          party.name,
          party.type === 'customer' ? 'Customer' : 'Supplier',
          party.phone ?? '',
          party.city ?? '',
          money(-balance),
        ]),
        totals: ['TOTAL PAYABLE', '', '', '', money(data.totalPayable)],
      },
    ],
  };
}

export async function stockBook(): Promise<ReportBook> {
  const data = await stockSummary();
  const sheet: SheetSpec = {
    name: 'Stock',
    columns: [
      { header: 'Item', width: 28 },
      { header: 'Category', width: 16 },
      { header: 'HSN', width: 12 },
      { header: 'Unit', width: 10 },
      { header: 'Stock', width: 12 },
      { header: 'Alert at', width: 10 },
      { header: 'Status', width: 14 },
      { header: 'Purchase price', width: 15, money: true },
      { header: 'Sale price', width: 14, money: true },
      { header: 'GST %', width: 10 },
      { header: 'Stock value', width: 15, money: true },
    ],
    rows: data.rows.map(({ item, stockValue, level }) => [
      item.name,
      item.category ?? '',
      item.hsnCode ?? '',
      item.unit,
      qty(item.currentStock),
      item.minStock > 0 ? qty(item.minStock) : '',
      STOCK_LABEL[level],
      money(item.purchasePrice),
      money(item.salePrice),
      formatTaxRate(item.taxRate),
      money(stockValue),
    ]),
    totals: [
      'TOTAL',
      `${data.totalItems} item(s)`,
      '',
      '',
      '',
      '',
      `${data.reorderCount} to reorder`,
      '',
      '',
      '',
      money(data.totalValue),
    ],
  };
  return { title: 'Stock Summary', filename: 'stock-report', sheets: [sheet] };
}

/**
 * Profit: the summary a shopkeeper reads top-to-bottom (sales → cost → gross →
 * overheads → net), then the item rows behind it and the overheads they were
 * charged against.
 */
export async function profitBook(from: string, to: string): Promise<ReportBook> {
  const report = await profitReport(from, to);

  const summary: SheetSpec = {
    name: 'Summary',
    columns: [
      { header: 'Particulars', width: 32 },
      { header: 'Amount', width: 18, money: true },
    ],
    rows: [
      ['Sale value (before GST)', money(report.saleValue)],
      ['Less: discount given', money(-report.discount)],
      ['Net sales', money(report.netSaleValue)],
      ['Less: cost of goods sold', money(-report.costValue)],
      ['GROSS PROFIT', money(report.grossProfit)],
      // A percentage and a count are text in the money column, so neither can
      // be printed (or summed) as rupees.
      ['Gross margin %', `${marginPercent(report.grossProfit, report.netSaleValue)}%`],
      ['', ''],
      ['Less: expenses', money(-report.expenses)],
      ['', ''],
      ['Sale invoices', String(report.invoiceCount)],
    ],
    totals: ['NET PROFIT', money(report.netProfit)],
  };

  const itemSheet: SheetSpec = {
    name: 'Item-wise',
    columns: [
      { header: 'Item', width: 28 },
      { header: 'Unit', width: 10 },
      { header: 'Qty sold', width: 12 },
      { header: 'Sale value', width: 15, money: true },
      { header: 'Cost', width: 15, money: true },
      { header: 'Profit', width: 15, money: true },
      { header: 'Margin %', width: 11 },
    ],
    rows: report.items.map((r) => [
      r.name,
      r.unit,
      qty(r.qty),
      money(r.saleValue),
      money(r.costValue),
      money(r.profit),
      marginPercent(r.profit, r.saleValue),
    ]),
    totals: [
      'TOTAL',
      '',
      '',
      money(report.saleValue),
      money(report.costValue),
      money(report.saleValue - report.costValue),
      marginPercent(report.saleValue - report.costValue, report.saleValue),
    ],
  };

  const expenseSheet: SheetSpec = {
    name: 'Expenses',
    columns: [
      { header: 'Category', width: 26 },
      { header: 'Entries', width: 10 },
      { header: 'Amount', width: 16, money: true },
    ],
    rows: report.expenseRows.map((e) => [e.category, e.count, money(e.total)]),
    totals: ['TOTAL', '', money(report.expenses)],
  };

  return {
    title: 'Profit Report',
    subtitle: periodLine(from, to),
    filename: `profit-report${stamp(from, to)}`,
    sheets: [summary, itemSheet, expenseSheet],
  };
}

/**
 * The richest export — this is the one that goes to the accountant: a summary
 * block, the rate-wise slab tables, and the full sales/purchase invoice lists.
 */
export async function gstBook(from: string, to: string): Promise<ReportBook> {
  const [data, rates] = await Promise.all([gstSummary(from, to), gstRateBreakup(from, to)]);

  const summary: SheetSpec = {
    name: 'Summary',
    columns: [
      { header: 'Particulars', width: 30 },
      { header: 'Amount', width: 18, money: true },
    ],
    rows: [
      ['Taxable sales (output, net of returns)', money(data.taxableSales)],
      ['GST collected on sales (net of returns)', money(data.outputTax)],
      ['', ''],
      ['Taxable purchases (input, net of returns)', money(data.taxablePurchases)],
      ['GST paid on purchases (net of returns)', money(data.inputTax)],
      ['', ''],
      // Counts are text in the money column, so they never print as rupees.
      ['Sale invoices', String(data.salesRows.length)],
      ['Sale returns (credit notes)', String(data.saleReturnRows.length)],
      ['Purchase bills', String(data.purchaseRows.length)],
      ['Purchase returns (debit notes)', String(data.purchaseReturnRows.length)],
    ],
    totals: [
      data.netPayable >= 0 ? 'NET GST PAYABLE' : 'NET INPUT CREDIT',
      money(Math.abs(data.netPayable)),
    ],
  };

  const sheets: SheetSpec[] = [
    summary,
    rateSheet('Sales rate-wise', rates.sales),
    rateSheet('Purchase rate-wise', rates.purchases),
    invoiceSheet('Sales invoices', data.salesRows),
  ];
  if (data.saleReturnRows.length) sheets.push(invoiceSheet('Sale returns', data.saleReturnRows));
  sheets.push(invoiceSheet('Purchase bills', data.purchaseRows));
  if (data.purchaseReturnRows.length) {
    sheets.push(invoiceSheet('Purchase returns', data.purchaseReturnRows));
  }
  return {
    title: 'GST Summary',
    subtitle: periodLine(from, to),
    filename: `gst-report${stamp(from, to)}`,
    sheets,
  };
}

// ── Excel exports, kept by name for the screens that call them ────────────────

export const exportPurchaseReportExcel = async (from: string, to: string) =>
  shareBookExcel(await purchaseReportBook(from, to));
export const exportItemSalesExcel = async (from: string, to: string) =>
  shareBookExcel(await itemSalesBook(from, to));
export const exportDayBookExcel = async (day: string) => shareBookExcel(await dayBookBook(day));
export const exportSalesReportExcel = async (from: string, to: string) =>
  shareBookExcel(await salesReportBook(from, to));
export const exportAgingExcel = async (side: AgingSide = 'receivable') =>
  shareBookExcel(await agingBook(side));
export const exportOutstandingExcel = async () => shareBookExcel(await outstandingBook());
export const exportStockExcel = async () => shareBookExcel(await stockBook());
export const exportProfitExcel = async (from: string, to: string) =>
  shareBookExcel(await profitBook(from, to));
export const exportGstExcel = async (from: string, to: string) =>
  shareBookExcel(await gstBook(from, to));

/**
 * One account's cash book. The balance column is carried through, so the sheet
 * can be reconciled against a passbook line by line rather than only in total.
 */
export async function exportCashBookExcel(accountId: number | null): Promise<string> {
  const book = await accountBook(accountId);
  if (!book) throw new Error('That account no longer exists.');
  const name = book.account?.name ?? 'Not assigned';

  return shareBookExcel({
    title: `Cash Book — ${name}`,
    filename: `cash-book-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    sheets: [
      {
        name: 'Cash book',
        columns: [
          { header: 'Date', width: 12 },
          { header: 'Particulars', width: 26 },
          { header: 'Details', width: 26 },
          { header: 'In', width: 14, money: true },
          { header: 'Out', width: 14, money: true },
          { header: 'Balance', width: 15, money: true },
        ],
        rows: book.entries.map((e) => [
          e.date,
          e.label,
          e.sub,
          e.delta > 0 ? money(e.delta) : '',
          e.delta < 0 ? money(-e.delta) : '',
          money(e.balance),
        ]),
        totals: [
          'CLOSING BALANCE',
          '',
          '',
          money(book.entries.reduce((s, e) => s + (e.delta > 0 ? e.delta : 0), 0)),
          money(book.entries.reduce((s, e) => s + (e.delta < 0 ? -e.delta : 0), 0)),
          money(book.balance),
        ],
      },
    ],
  });
}
