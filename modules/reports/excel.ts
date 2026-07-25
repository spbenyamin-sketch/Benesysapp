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
import {
  gstRateBreakup,
  gstSummary,
  partyOutstanding,
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
      { header: 'Total GST', width: 14, money: true },
    ],
    rows: rows.map((r) => [
      formatTaxRate(r.taxRate),
      r.lines,
      money(r.taxable),
      money(r.cgst),
      money(r.sgst),
      money(r.tax),
    ]),
    totals: [
      'TOTAL',
      rows.reduce((s, r) => s + r.lines, 0),
      money(rows.reduce((s, r) => s + r.taxable, 0)),
      money(rows.reduce((s, r) => s + r.cgst, 0)),
      money(rows.reduce((s, r) => s + r.sgst, 0)),
      money(rows.reduce((s, r) => s + r.tax, 0)),
    ],
  };
}

// ── Public exports, one per report screen ─────────────────────────────────────

export async function exportSalesReportExcel(from: string, to: string): Promise<string> {
  const report = await salesReport(from, to);
  const preamble = await preambleFor('Sales Report', { from, to });
  return shareWorkbook([invoiceSheet('Sales', report.rows, preamble)], `sales-report${stamp(from, to)}.xlsx`);
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
      ['Taxable sales (output)', money(data.taxableSales)],
      ['GST collected on sales', money(data.outputTax)],
      ['', ''],
      ['Taxable purchases (input)', money(data.taxablePurchases)],
      ['GST paid on purchases', money(data.inputTax)],
      ['', ''],
      ['Sale invoices', data.salesRows.length],
      ['Purchase bills', data.purchaseRows.length],
    ],
    totals: [
      data.netPayable >= 0 ? 'NET GST PAYABLE' : 'NET INPUT CREDIT',
      money(Math.abs(data.netPayable)),
    ],
  };

  return shareWorkbook(
    [
      summary,
      rateSheet('Sales rate-wise', rates.sales),
      rateSheet('Purchase rate-wise', rates.purchases),
      invoiceSheet('Sales invoices', data.salesRows),
      invoiceSheet('Purchase bills', data.purchaseRows),
    ],
    `gst-report${stamp(from, to)}.xlsx`,
  );
}
