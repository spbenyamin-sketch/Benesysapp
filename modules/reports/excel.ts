// Excel (.xlsx) export for every report, using the dependency-free writer in
// utils/xlsx. Each export builds a workbook, drops it in cache storage and hands
// it to the OS share sheet — so it can go to WhatsApp, Drive, Gmail or the CA in
// one tap, with no server and no internet.
//
// Money is exported as RUPEE NUMBERS (paise ÷ 100), never as pre-formatted
// strings: the whole point of Excel is that the accountant can sum the column.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSetting } from '@/modules/settings/service';
import { agingReport, AGING_BUCKETS } from '@/modules/reports/aging';
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
import { formatTaxRate } from '@/utils/format';
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

async function preambleFor(title: string, range?: { from: string; to: string }): Promise<string[]> {
  const business = (await getSetting('business_name')) ?? 'Billing App';
  const gstin = await getSetting('business_gstin');
  const lines = [business, title];
  if (gstin) lines.push(`GSTIN: ${gstin}`);
  if (range) lines.push(`Period: ${range.from} to ${range.to}`);
  return lines;
}

/** Write the workbook to cache and open the share sheet. Returns the file uri. */
async function shareWorkbook(sheets: SheetSpec[], filename: string): Promise<string> {
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

const stamp = (from?: string, to?: string) => (from && to ? `_${from}_to_${to}` : '');

// ── Invoice list sheet, reused by the sales and GST exports ───────────────────
function invoiceSheet(name: string, rows: InvoiceWithParty[], preamble?: string[]): SheetSpec {
  return {
    name,
    preamble,
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

// ── Public exports, one per report screen ─────────────────────────────────────

/** The purchase side: the bills, and a sheet of who the money went to. */
export async function exportPurchaseReportExcel(from: string, to: string): Promise<string> {
  const report = await purchaseReport(from, to);
  const preamble = await preambleFor('Purchase Report', { from, to });
  const sheets: SheetSpec[] = [invoiceSheet('Purchases', report.rows, preamble)];
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
  return shareWorkbook(sheets, `purchase-report${stamp(from, to)}.xlsx`);
}

/** What moved off the shelf, biggest first — quantity and value, net of returns. */
export async function exportItemSalesExcel(from: string, to: string): Promise<string> {
  const report = await itemSalesReport(from, to);
  const preamble = await preambleFor('Item-wise Sales', { from, to });
  return shareWorkbook(
    [
      {
        name: 'Item-wise sales',
        preamble,
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
    `item-sales${stamp(from, to)}.xlsx`,
  );
}

/**
 * One day, as the shop lived it. The cash column is the point: a credit sale is
 * on the page but contributes nothing to it, so the sheet cannot be read as
 * takings the shop never received.
 */
export async function exportDayBookExcel(day: string): Promise<string> {
  const book = await dayBook(day);
  const preamble = await preambleFor('Day Book');
  preamble.push(`Day: ${day}`);
  return shareWorkbook(
    [
      {
        name: 'Day book',
        preamble,
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
    `day-book-${day}.xlsx`,
  );
}

export async function exportSalesReportExcel(from: string, to: string): Promise<string> {
  const report = await salesReport(from, to);
  const preamble = await preambleFor('Sales Report', { from, to });
  const sheets = [invoiceSheet('Sales', report.rows, preamble)];
  // Returns get their own sheet rather than negative rows among the sales: the
  // accountant wants to see the credit notes as documents in their own right.
  if (report.returns.length) sheets.push(invoiceSheet('Sale returns', report.returns));
  return shareWorkbook(sheets, `sales-report${stamp(from, to)}.xlsx`);
}

/**
 * The chase list, oldest money to the right. One row per party, with the
 * columns adding across to the party's balance and down to the report total —
 * so the accountant's copy says exactly what the screen says.
 */
export async function exportAgingExcel(): Promise<string> {
  const data = await agingReport();
  const preamble = await preambleFor('Receivables Aging');
  preamble.push(`As of: ${data.asOf}`);

  return shareWorkbook(
    [
      {
        name: 'Aging',
        preamble,
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
    'aging-report.xlsx',
  );
}

export async function exportOutstandingExcel(): Promise<string> {
  const data = await partyOutstanding();
  const preamble = await preambleFor('Outstanding Report');
  const columns = [
    { header: 'Party', width: 28 },
    { header: 'Type', width: 12 },
    { header: 'Phone', width: 16 },
    { header: 'City', width: 16 },
    { header: 'Amount', width: 16, money: true },
  ];

  const sheets: SheetSpec[] = [
    {
      name: 'To collect',
      preamble,
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
  ];
  return shareWorkbook(sheets, 'outstanding-report.xlsx');
}

export async function exportStockExcel(): Promise<string> {
  const data = await stockSummary();
  const preamble = await preambleFor('Stock Summary');
  const sheet: SheetSpec = {
    name: 'Stock',
    preamble,
    columns: [
      { header: 'Item', width: 28 },
      { header: 'Category', width: 16 },
      { header: 'HSN', width: 12 },
      { header: 'Unit', width: 10 },
      { header: 'Stock', width: 12 },
      { header: 'Purchase price', width: 15, money: true },
      { header: 'Sale price', width: 14, money: true },
      { header: 'GST %', width: 10 },
      { header: 'Stock value', width: 15, money: true },
    ],
    rows: data.rows.map(({ item, stockValue }) => [
      item.name,
      item.category ?? '',
      item.hsnCode ?? '',
      item.unit,
      qty(item.currentStock),
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
      '',
      '',
      money(data.totalValue),
    ],
  };
  return shareWorkbook([sheet], 'stock-report.xlsx');
}

/**
 * Profit: the summary a shopkeeper reads top-to-bottom (sales → cost → gross →
 * overheads → net), then the item rows behind it and the overheads they were
 * charged against.
 */
export async function exportProfitExcel(from: string, to: string): Promise<string> {
  const report = await profitReport(from, to);
  const preamble = await preambleFor('Profit Report', { from, to });

  const summary: SheetSpec = {
    name: 'Summary',
    preamble,
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
      ['Gross margin %', marginPercent(report.grossProfit, report.netSaleValue)],
      ['', ''],
      ['Less: expenses', money(-report.expenses)],
      ['', ''],
      ['Sale invoices', report.invoiceCount],
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

  return shareWorkbook([summary, itemSheet, expenseSheet], `profit-report${stamp(from, to)}.xlsx`);
}

/**
 * The richest export — this is the one that goes to the accountant: a summary
 * block, the rate-wise slab tables, and the full sales/purchase invoice lists.
 */
export async function exportGstExcel(from: string, to: string): Promise<string> {
  const [data, rates, preamble] = await Promise.all([
    gstSummary(from, to),
    gstRateBreakup(from, to),
    preambleFor('GST Summary', { from, to }),
  ]);

  const summary: SheetSpec = {
    name: 'Summary',
    preamble,
    columns: [
      { header: 'Particulars', width: 30 },
      { header: 'Amount', width: 18, money: true },
    ],
    rows: [
      ['Taxable sales (output, net of returns)', money(data.taxableSales)],
      ['GST collected on sales (net of returns)', money(data.outputTax)],
      ['', ''],
      ['Taxable purchases (input)', money(data.taxablePurchases)],
      ['GST paid on purchases', money(data.inputTax)],
      ['', ''],
      ['Sale invoices', data.salesRows.length],
      ['Sale returns (credit notes)', data.saleReturnRows.length],
      ['Purchase bills', data.purchaseRows.length],
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
  return shareWorkbook(sheets, `gst-report${stamp(from, to)}.xlsx`);
}
