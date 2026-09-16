// The counter receipt, on a 58mm or an 80mm roll.
//
// The A4 tax invoice in pdf.ts is the document a customer files; this is the slip
// the counter tears off and hands over. Same bill, same money — only the paper is
// different, so nothing here re-derives a total. Every figure printed below comes
// off the stored invoice exactly as the A4 page prints it.
//
// 58mm of roll is about 48mm of printable width, roughly 32 monospace characters.
// That is why there is no table anywhere in this file: a column layout that fits
// an item name, a qty, a rate and an amount on one 32-character row does not
// exist. Each line gets its name on its own row and its arithmetic underneath.
//
// The 80mm roll is the same slip on wider paper, and deliberately so: the layout
// is flex rows that grow, so the wider roll simply gives the item names and the
// shop's own Tamil more room to breathe before they wrap. Only the widths below
// change between the two — one file, one receipt, one set of rules.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { imageDataUri } from '@/modules/settings/brandImages';
import { netPaidForInvoice } from '@/modules/payments/service';
import {
  getBusinessProfile,
  type BusinessProfile,
  type PrintFormat,
} from '@/modules/settings/service';
import { formatDate, formatQty, formatTaxRate } from '@/utils/format';
import { escapeHtml, htmlMoney } from '@/utils/html';
import { qrSvg, upiPayload } from '@/utils/qr';
import { isWeb, printHtml } from '@/utils/webFile';
import { discountLabel, splitTax, supplyType } from '@/utils/gst';
import type { InvoiceType } from '@/utils/invoiceNumber';
import type { InvoiceDetail } from '@/modules/invoices/service';

const esc = escapeHtml;
const money = htmlMoney;

/** The rolls this file prints on. A4 is the other paper entirely — see pdf.ts. */
export type RollFormat = Exclude<PrintFormat, 'a4'>;

/**
 * What differs between the two rolls, and nothing else does: the width the print
 * service is told the paper is, and how wide the shop's logo may print on it.
 * The logo cap is a figure rather than a fraction of the width so that the 58mm
 * slip keeps printing exactly what it printed before the 80mm roll existed.
 */
const ROLLS: Record<RollFormat, { mm: number; logoMm: number }> = {
  thermal58: { mm: 58, logoMm: 30 },
  thermal80: { mm: 80, logoMm: 44 },
};

/**
 * What the slip calls itself. Shorter than the A4 titles on purpose — the roll
 * is 32 characters wide and "DELIVERY CHALLAN" beside nothing else still reads
 * as a heading, but the shorter word leaves room for a centred layout that does
 * not wrap on a shop name of any length.
 */
const DOC_LABEL: Record<InvoiceType, string> = {
  sale: 'INVOICE',
  purchase: 'PURCHASE',
  quotation: 'QUOTATION',
  challan: 'CHALLAN',
  saleReturn: 'CREDIT NOTE',
  purchaseReturn: 'DEBIT NOTE',
};

/** Documents money is actually settled against — a quotation is not owed. */
const settlesMoney = (type: InvoiceType): boolean => type !== 'quotation' && type !== 'challan';

/**
 * The scan-to-pay code for a bill, or nothing at all.
 *
 * One rule, one place: the A4 page (modules/invoices/pdf.ts) asks this same
 * function, so the two papers can never disagree about when a QR is printed. It
 * lives here rather than beside the A4 markup because the paper choice makes
 * pdf.ts import this file, not the other way round.
 *
 * Only on a document the shop is owed money on. A bill already settled gets no
 * code — a QR on a paid bill is an invitation to pay it twice. A part-paid one
 * gets a code with NO amount in it, because the page does not know what is left
 * and a wrong figure is worse than none.
 */
export function upiPayment(
  detail: InvoiceDetail,
  biz: BusinessProfile,
): { svg: string; label: string; upiId: string } | null {
  const { invoice } = detail;
  if (!biz.upiId || invoice.type !== 'sale') return null;
  if (invoice.paymentStatus === 'paid' || invoice.grandTotal <= 0) return null;
  const partial = invoice.paymentStatus === 'partial';
  try {
    const svg = qrSvg(
      upiPayload({
        vpa: biz.upiId,
        name: biz.name,
        amount: partial ? undefined : invoice.grandTotal,
        note: invoice.invoiceNo,
      }),
      110,
    );
    return {
      svg,
      label: partial ? 'Scan to pay the balance' : `Scan to pay ${money(invoice.grandTotal)}`,
      upiId: biz.upiId,
    };
  } catch {
    // A code that cannot be built is simply left off; the bill still prints.
    return null;
  }
}

/**
 * Everything the receipt needs, already loaded. Taking it rather than fetching it
 * keeps the builder a pure function — it prints what it is handed and touches no
 * database, which is what makes it testable and what makes it impossible for the
 * paper to show a different number than the screen it was printed from.
 */
export interface ThermalBill {
  detail: InvoiceDetail;
  biz: BusinessProfile;
  /** The shop's logo already inlined as a data-uri — the print sandbox will not
   *  load a file:// path, so the bytes have to travel inside the HTML. */
  logo?: string | null;
  /** Paise already settled against this bill, so the slip can show a balance. */
  paid?: number;
  /** Which roll it is going on. 58mm unless the shop said otherwise, which is
   *  what every counter printed before the 80mm roll was an option. */
  roll?: RollFormat;
}

/** One totals row: label on the left, figure hard against the right edge. */
const totalRow = (label: string, value: string, cls = ''): string =>
  `<div class="row${cls ? ` ${cls}` : ''}"><span>${label}</span><span>${value}</span></div>`;

/**
 * The receipt as printable HTML, from data already in hand.
 *
 * The CSS is deliberately blunt: pure black on white, no greys and no borders a
 * thermal head has to dither. `-webkit-print-color-adjust: exact` stops the print
 * pipeline from "helpfully" lightening the QR into something no phone can read.
 */
export function thermalHtml({
  detail,
  biz,
  logo = null,
  paid = 0,
  roll = 'thermal58',
}: ThermalBill): string {
  const { invoice, party, lines } = detail;
  const paper = ROLLS[roll];

  // Buyer's state, frozen on the invoice when it was made; older invoices fall
  // back to wherever the party lives today. Same rule as the A4 page — a reprint
  // on a different paper must never flip a bill from CGST+SGST to IGST.
  const placeOfSupply = invoice.placeOfSupply || party?.state || '';
  const supply = supplyType(biz.state, placeOfSupply);
  const split = splitTax(invoice.taxTotal, supply);

  // Only worth naming a rate on the tax rows when the whole bill sits on one
  // slab; a mixed bill would need a summary table, and there is no room for one.
  const rates = new Set(lines.filter((l) => l.taxRate > 0).map((l) => l.taxRate));
  const single = rates.size === 1 ? [...rates][0] : null;
  const halfLabel = single != null ? ` ${formatTaxRate(single / 2)}` : '';
  const fullLabel = single != null ? ` ${formatTaxRate(single)}` : '';

  const itemRows = lines
    .map(
      (l) => `<div class="item">
      <div class="item-name">${esc(l.itemName)}</div>
      <div class="row sub"><span>${formatQty(l.qty)} ${esc(l.itemUnit)} × ${money(l.rate)}</span><span>${money(l.amount)}</span></div>
      ${
        l.discount > 0
          ? `<div class="row sub"><span>${discountLabel(l.discountPercent)}</span><span>- ${money(l.discount)}</span></div>`
          : ''
      }
    </div>`,
    )
    .join('');

  // The tax rows are the invoice's own tax figure split for display, so they add
  // back to it exactly. A shop billing without GST gets no rows at all rather
  // than two lines of ₹0.00 eating the roll.
  const taxRows =
    invoice.taxTotal === 0
      ? ''
      : supply === 'inter'
        ? totalRow(`IGST${fullLabel}`, money(split.igst))
        : totalRow(`CGST${halfLabel}`, money(split.cgst)) +
          totalRow(`SGST${halfLabel}`, money(split.sgst));

  const roundOff = Number.isFinite(invoice.roundOff) ? invoice.roundOff : 0;

  // What is still owed. Shown only where money is actually settled — a balance
  // due on a quotation would be a debt the customer never took on.
  const owing = settlesMoney(invoice.type) && invoice.paymentStatus !== 'paid';
  const due = Math.max(0, invoice.grandTotal - paid);

  const pay = upiPayment(detail, biz);

  return `<!doctype html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: ${paper.mm}mm auto; margin: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    body {
      width: ${paper.mm}mm; margin: 0; padding: 2mm; color: #000; background: #fff;
      font-family: 'Roboto Mono', 'Noto Sans Mono', 'Courier New', monospace;
      font-size: 10px; line-height: 1.35;
    }
    /* Tamil has no monospace face on most phones. The shop's own words get a
       stack that names one, so a Tamil name or terms print as letters rather
       than as boxes; the money rows stay monospace, where the width matters. */
    .tamil { font-family: 'Noto Sans Tamil', 'Latha', 'Roboto Mono', monospace; }
    .c { text-align: center; }
    .b { font-weight: 700; }
    .shop { font-size: 13px; font-weight: 700; line-height: 1.2; }
    .doc { font-size: 11px; font-weight: 700; letter-spacing: 1px; }
    .rule { border-top: 1px dashed #000; margin: 4px 0; }
    /* Flex, not columns: the label takes what it needs and the figure is always
       hard against the right edge, whatever the item is called. */
    .row { display: flex; justify-content: space-between; gap: 4px; }
    .row span:last-child { text-align: right; white-space: nowrap; }
    .item { margin-bottom: 3px; }
    .item-name { word-break: break-word; }
    .sub { padding-left: 8px; }
    .grand { font-size: 13px; font-weight: 700; margin-top: 2px; }
    .logo { display: block; margin: 0 auto 2px; max-width: ${paper.logoMm}mm; max-height: 14mm; object-fit: contain; }
    .qr { text-align: center; margin-top: 4px; }
    .qr svg { width: 110px; height: 110px; }
    .qr-label { font-size: 9px; font-weight: 700; }
    .terms { white-space: pre-wrap; font-size: 9px; }
    /* Blank roll under the last line: a thermal printer tears a few millimetres
       above the head, and without this the tear takes the grand total with it. */
    .feed { height: 14mm; }
  </style></head><body>
    ${logo ? `<img class="logo" src="${logo}" />` : ''}
    <div class="c">
      <div class="shop tamil">${esc(biz.name)}</div>
      ${biz.address ? `<div class="tamil">${esc(biz.address)}</div>` : ''}
      ${biz.phone ? `<div>${esc(biz.phone)}</div>` : ''}
      ${biz.gstin ? `<div>GSTIN ${esc(biz.gstin)}</div>` : ''}
    </div>
    <div class="rule"></div>
    <div class="c doc">${DOC_LABEL[invoice.type]}</div>
    <div class="rule"></div>

    <div class="b">${esc(invoice.invoiceNo)}</div>
    <div>${formatDate(invoice.date)}</div>
    <div class="tamil">${esc(party?.name ?? '-')}</div>
    ${party?.phone ? `<div>${esc(party.phone)}</div>` : ''}
    <div class="rule"></div>

    ${itemRows}
    <div class="rule"></div>

    ${totalRow(invoice.taxMode === 'inclusive' ? 'Taxable value' : 'Subtotal', money(invoice.subtotal))}
    ${taxRows}
    ${invoice.discount > 0 ? totalRow(discountLabel(invoice.discountPercent), `- ${money(invoice.discount)}`) : ''}
    ${
      roundOff !== 0
        ? totalRow('Round off', `${roundOff > 0 ? '+ ' : '- '}${money(Math.abs(roundOff))}`)
        : ''
    }
    ${totalRow('TOTAL', money(Math.max(0, invoice.grandTotal)), 'grand')}
    ${
      owing
        ? `${paid > 0 ? totalRow('Paid', money(paid)) : ''}${totalRow('Balance due', money(due), 'b')}`
        : ''
    }
    ${
      invoice.taxMode === 'inclusive'
        ? '<div class="c" style="font-size:9px">Rates include GST.</div>'
        : ''
    }

    ${
      pay
        ? `<div class="rule"></div>
    <div class="qr">
      ${pay.svg}
      <div class="qr-label">${esc(pay.label)}</div>
      <div>${esc(pay.upiId)}</div>
    </div>`
        : ''
    }

    ${biz.terms ? `<div class="rule"></div><div class="terms tamil">${esc(biz.terms)}</div>` : ''}
    <div class="rule"></div>
    <div class="c tamil">நன்றி · Thank you</div>
    <div class="feed"></div>
  </body></html>`;
}

/**
 * The bits the builder cannot be handed by a caller that only has the bill: the
 * shop's profile, its logo as bytes, and — only when something is still owed —
 * what has been paid so far. The payments query is skipped on a settled bill
 * because its answer would not be printed.
 */
async function loadForPrint(detail: InvoiceDetail, roll: RollFormat): Promise<ThermalBill> {
  const biz = await getBusinessProfile();
  const wantsBalance =
    settlesMoney(detail.invoice.type) && detail.invoice.paymentStatus !== 'paid';
  const [logo, paid] = await Promise.all([
    imageDataUri(biz.logoUri),
    wantsBalance ? netPaidForInvoice(detail.invoice.id) : Promise.resolve(0),
  ]);
  return { detail, biz, logo, paid, roll };
}

/** The roll in PostScript points (72 to the inch) — the page a shared PDF is. */
const rollWidthPt = (roll: RollFormat): number => Math.round((ROLLS[roll].mm / 25.4) * 72);

/** Render the receipt to a PDF the width of the roll and open the share sheet. */
export async function shareThermalPdf(
  detail: InvoiceDetail,
  roll: RollFormat = 'thermal58',
): Promise<void> {
  const html = thermalHtml(await loadForPrint(detail, roll));
  // A browser has no share sheet; its print dialog saves the PDF instead.
  if (isWeb) return printHtml(html);
  const { uri } = await Print.printToFileAsync({ html, width: rollWidthPt(roll) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: detail.invoice.invoiceNo,
    });
  }
}

/**
 * Open the OS print dialog with the receipt. The @page rule in the HTML tells the
 * print service the paper is a roll of that width and of unbounded length, which
 * is what a counter printer advertises itself as — no native module, works in
 * Expo Go.
 */
export async function printThermal(
  detail: InvoiceDetail,
  roll: RollFormat = 'thermal58',
): Promise<void> {
  const bill = await loadForPrint(detail, roll);
  if (isWeb) return printHtml(thermalHtml(bill));
  await Print.printAsync({ html: thermalHtml(bill) });
}
