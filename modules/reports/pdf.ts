// PDF for every report: the same ReportBook the Excel export writes, printed as
// HTML tables through expo-print and handed to the share sheet — exactly the
// path an invoice PDF takes. On web the browser's print dialog saves it.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportBusiness, type ReportBook } from '@/modules/reports/excel';
import { buildReportHtml, type ReportDoc, type ReportTable } from '@/utils/reportPdf';
import { isWeb, printHtml } from '@/utils/webFile';
import type { SheetSpec } from '@/utils/xlsx';

/**
 * A sheet as a printed table. Sheets hold money as rupee numbers (for Excel to
 * sum); the printed page formats paise, so money cells go back to paise here.
 */
export function sheetToTable(sheet: SheetSpec): ReportTable {
  const toPaise = (row: SheetSpec['rows'][number]) =>
    row.map((v, i) =>
      sheet.columns[i]?.money && typeof v === 'number' ? Math.round(v * 100) : v,
    );
  return {
    name: sheet.name,
    columns: sheet.columns.map((c) => ({ header: c.header, money: c.money })),
    rows: sheet.rows.map(toPaise),
    totals: sheet.totals ? toPaise(sheet.totals) : undefined,
  };
}

export function bookToDoc(
  book: ReportBook,
  biz: { name: string; gstin: string | null },
): ReportDoc {
  return {
    business: biz.name,
    gstin: biz.gstin,
    title: book.title,
    subtitle: book.subtitle,
    tables: book.sheets.map(sheetToTable),
  };
}

/** Render the report to a PDF and open the share sheet. Resolves with the file uri. */
export async function shareBookPdf(book: ReportBook): Promise<string> {
  const html = buildReportHtml(bookToDoc(book, await reportBusiness()));
  // A browser has no share sheet; its print dialog saves the PDF instead.
  if (isWeb) {
    await printHtml(html);
    return `${book.filename}.pdf`;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: book.title,
    });
  }
  return uri;
}
