import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { imageDataUri } from '@/modules/settings/brandImages';
import {
  getBusinessProfile,
  getPrintFormat,
  type BusinessProfile,
} from '@/modules/settings/service';
import { printThermal, shareThermalPdf, upiPayment } from '@/modules/invoices/thermal';
import { formatDate, formatQty, formatTaxRate } from '@/utils/format';
import { escapeHtml, htmlMoney } from '@/utils/html';
import {
  lineAmount,
  lineTax,
  splitTax,
  supplyType,
  type SupplyType,
  type TaxMode,
  type TaxSplit,
} from '@/utils/gst';
import type { InvoiceType } from '@/utils/invoiceNumber';
import type { InvoiceDetail } from '@/modules/invoices/service';

const DOC_LABEL: Record<InvoiceType, string> = {
  sale: 'TAX INVOICE',
  purchase: 'PURCHASE BILL',
  quotation: 'QUOTATION',
  challan: 'DELIVERY CHALLAN',
  saleReturn: 'CREDIT NOTE',
  purchaseReturn: 'DEBIT NOTE',
};

const esc = escapeHtml;
const money = htmlMoney;

// ── Rate-wise tax summary ─────────────────────────────────────────────────────
// The table a GST invoice is expected to carry: one row per slab, with the
// taxable value and the tax on it. Built from the line rows rather than from the
// invoice header (which only holds a single rolled-up tax figure).

interface RateRow extends TaxSplit {
  taxRate: number; // basis points
  taxable: number; // paise, pre-tax
}

/**
 * The tax that was actually charged on one stored line, re-derived the same way
 * the invoice computed it, so the slab rows re-add to the stored total:
 *   exclusive → tax was added on top of the stored (pre-tax) amount
 *   inclusive → the stored amount was carved out of the entered gross, and the
 *               remainder IS the tax (that is how splitInclusive works)
 * Either way any line discount came off BEFORE the tax was worked out, so it has
 * to come off the gross here too — otherwise the money given away would be
 * printed as tax the customer was charged.
 */
function taxOfLine(l: InvoiceDetail['lines'][number], taxMode: TaxMode): number {
  if (taxMode === 'inclusive') return lineAmount(l.qty, l.rate) - l.discount - l.amount;
  return lineTax(l.amount, l.taxRate);
}

function rateRows(detail: InvoiceDetail, supply: SupplyType): RateRow[] {
  const { invoice, lines } = detail;
  const byRate = new Map<number, { taxRate: number; taxable: number; tax: number }>();
  for (const l of lines) {
    const entry = byRate.get(l.taxRate) ?? { taxRate: l.taxRate, taxable: 0, tax: 0 };
    entry.taxable += l.amount;
    entry.tax += taxOfLine(l, invoice.taxMode);
    byRate.set(l.taxRate, entry);
  }

  const rows = [...byRate.values()].sort((a, b) => a.taxRate - b.taxRate);

  // The invoice header is the number of record. If re-deriving lands a paise
  // away from it (older rows, a hand-edited total), the difference is given to
  // the highest taxed slab rather than printed as a table that does not add up.
  const derived = rows.reduce((s, r) => s + r.tax, 0);
  const residual = invoice.taxTotal - derived;
  if (residual !== 0) {
    const target = [...rows].reverse().find((r) => r.taxRate > 0);
    if (target) target.tax += residual;
  }

  return rows.map((r) => ({ ...r, ...splitTax(r.tax, supply) }));
}

/**
 * The pictures the page needs, already inlined. The print view renders in its
 * own sandbox and will not reliably load a file:// path, so the bytes travel
 * inside the HTML.
 */
interface PrintAssets {
  logo: string | null;
  signature: string | null;
}

async function loadAssets(biz: BusinessProfile): Promise<PrintAssets> {
  const [logo, signature] = await Promise.all([
    imageDataUri(biz.logoUri),
    imageDataUri(biz.signatureUri),
  ]);
  return { logo, signature };
}

/**
 * The scan-to-pay block, or nothing at all. WHEN a code is printed is decided in
 * modules/invoices/thermal (see `upiPayment`) so that the sheet and the counter
 * receipt can never disagree about it; only the markup around it is A4's own.
 */
function payBlock(detail: InvoiceDetail, biz: BusinessProfile): string {
  const pay = upiPayment(detail, biz);
  if (!pay) return '';
  return `<div class="pay">
      ${pay.svg}
      <div class="pay-label">${esc(pay.label)}</div>
      <div class="pay-upi">${esc(pay.upiId)}</div>
    </div>`;
}

function buildHtml(detail: InvoiceDetail, biz: BusinessProfile, assets: PrintAssets): string {
  const { invoice, party, lines } = detail;

  // Buyer's state, frozen on the invoice when it was made; older invoices fall
  // back to wherever the party lives today.
  const placeOfSupply = invoice.placeOfSupply || party?.state || '';
  const supply = supplyType(biz.state, placeOfSupply);

  const slabs = rateRows(detail, supply);
  const taxed = slabs.filter((r) => r.taxRate > 0 && (r.taxable !== 0 || r.tax !== 0));
  // Totals come off the very rows the summary table prints, so the two can never
  // disagree — and cgst + sgst (or igst) is exactly the invoice's tax total.
  const cgst = taxed.reduce((s, r) => s + r.cgst, 0);
  const sgst = taxed.reduce((s, r) => s + r.sgst, 0);
  const igst = taxed.reduce((s, r) => s + r.igst, 0);
  const taxable = taxed.reduce((s, r) => s + r.taxable, 0);
  const taxTotal = taxed.reduce((s, r) => s + r.tax, 0);

  // Only worth naming a rate on the totals rows when the whole bill sits on one
  // slab; a mixed bill has its rates spelled out in the summary table below.
  const single = taxed.length === 1 ? taxed[0].taxRate : null;
  const halfLabel = single != null ? ` (${formatTaxRate(single / 2)})` : '';
  const fullLabel = single != null ? ` (${formatTaxRate(single)})` : '';

  // The discount column only appears on a bill that actually gave one — a column
  // of dashes would tell the customer nothing and cost the item name its width.
  const anyLineDiscount = lines.some((l) => l.discount > 0);

  const rows = lines
    .map(
      (l, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(l.itemName)}</td>
        <td>${l.hsnCode ? esc(l.hsnCode) : ''}</td>
        <td class="num">${formatQty(l.qty)} ${esc(l.itemUnit)}</td>
        <td class="num">${money(l.rate)}</td>
        ${anyLineDiscount ? `<td class="num">${l.discount > 0 ? `- ${money(l.discount)}` : '-'}</td>` : ''}
        <td class="num">${l.taxRate > 0 ? formatTaxRate(l.taxRate) : '-'}</td>
        <td class="num">${money(l.amount)}</td>
      </tr>`,
    )
    .join('');

  const taxRows =
    supply === 'inter'
      ? `<div><span>IGST${fullLabel}</span><span>${money(igst)}</span></div>`
      : `<div><span>CGST${halfLabel}</span><span>${money(cgst)}</span></div>
      <div><span>SGST${halfLabel}</span><span>${money(sgst)}</span></div>`;

  const summary = taxed.length
    ? `<table class="summary">
      <thead><tr>
        <th>Tax rate</th>
        <th class="num">Taxable value</th>
        ${
          supply === 'inter'
            ? '<th class="num">IGST</th>'
            : '<th class="num">CGST</th><th class="num">SGST</th>'
        }
        <th class="num">Total tax</th>
      </tr></thead>
      <tbody>${taxed
        .map(
          (r) => `
        <tr>
          <td>${formatTaxRate(r.taxRate)}</td>
          <td class="num">${money(r.taxable)}</td>
          ${
            supply === 'inter'
              ? `<td class="num">${money(r.igst)}</td>`
              : `<td class="num">${money(r.cgst)}</td><td class="num">${money(r.sgst)}</td>`
          }
          <td class="num">${money(r.tax)}</td>
        </tr>`,
        )
        .join('')}
      </tbody>
      <tfoot><tr>
        <td>Total</td>
        <td class="num">${money(taxable)}</td>
        ${
          supply === 'inter'
            ? `<td class="num">${money(igst)}</td>`
            : `<td class="num">${money(cgst)}</td><td class="num">${money(sgst)}</td>`
        }
        <td class="num">${money(taxTotal)}</td>
      </tr></tfoot>
    </table>`
    : '';

  const roundOff = Number.isFinite(invoice.roundOff) ? invoice.roundOff : 0;

  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    * { font-family: -apple-system, Roboto, Arial, sans-serif; }
    body { color: #111; padding: 24px; font-size: 13px; }
    .doc { text-align: right; font-size: 20px; font-weight: 700; color: #208AEF; letter-spacing: 1px; }
    .biz { font-size: 20px; font-weight: 700; }
    .muted { color: #666; }
    .row { display: flex; justify-content: space-between; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border-bottom: 1px solid #e5e5e5; padding: 8px 6px; text-align: left; }
    th { background: #f4f8fe; font-size: 11px; text-transform: uppercase; color: #555; }
    .num { text-align: right; }
    .totals { margin-top: 16px; margin-left: auto; width: 260px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
    .summary { margin-top: 24px; }
    .summary-title { margin-top: 24px; font-size: 11px; text-transform: uppercase; color: #555; font-weight: 700; }
    .summary tfoot td { font-weight: 700; border-bottom: none; border-top: 1px solid #ccc; }
    .head { display: flex; align-items: flex-start; gap: 14px; }
    .head-text { flex: 1; }
    .logo { width: 68px; height: 68px; object-fit: contain; }
    .closing { display: flex; align-items: flex-end; gap: 20px; margin-top: 28px; }
    .closing-left { flex: 1; }
    .terms-title { font-size: 11px; text-transform: uppercase; color: #555; font-weight: 700; }
    .terms { font-size: 11px; color: #666; white-space: pre-wrap; max-width: 280px; margin-top: 4px; }
    .pay { text-align: center; }
    .pay-label { font-size: 11px; font-weight: 700; color: #111; margin-top: 2px; }
    .pay-upi { font-size: 10px; color: #888; }
    .sign { text-align: center; min-width: 150px; }
    .sign-img { width: 130px; height: 46px; object-fit: contain; }
    .sign-space { height: 46px; }
    .sign-line { border-top: 1px solid #bbb; padding-top: 4px; font-size: 11px; font-weight: 600; }
    .foot { margin-top: 28px; color: #999; font-size: 11px; text-align: center; }
  </style></head><body>
    <div class="head">
      ${assets.logo ? `<img class="logo" src="${assets.logo}" />` : ''}
      <div class="head-text">
        <div class="biz">${esc(biz.name)}</div>
        ${biz.address ? `<div class="muted">${esc(biz.address)}</div>` : ''}
        ${biz.gstin ? `<div class="muted">GSTIN: ${esc(biz.gstin)}</div>` : ''}
        ${biz.state ? `<div class="muted">State: ${esc(biz.state)}</div>` : ''}
        ${biz.phone ? `<div class="muted">${esc(biz.phone)}</div>` : ''}
      </div>
      <div class="doc">${DOC_LABEL[invoice.type]}</div>
    </div>

    <div class="row">
      <div>
        <div class="muted">Bill to</div>
        <div style="font-weight:600">${esc(party?.name ?? '-')}</div>
        ${party?.gstin ? `<div class="muted">GSTIN: ${esc(party.gstin)}</div>` : ''}
        ${party?.phone ? `<div class="muted">${esc(party.phone)}</div>` : ''}
        ${placeOfSupply ? `<div class="muted">Place of supply: ${esc(placeOfSupply)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div><b>${esc(invoice.invoiceNo)}</b></div>
        <div class="muted">${formatDate(invoice.date)}</div>
        ${invoice.dueDate ? `<div class="muted">Due: ${formatDate(invoice.dueDate)}</div>` : ''}
        <div class="muted">${invoice.paymentStatus.toUpperCase()}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>#</th><th>Item</th><th>HSN/SAC</th><th class="num">Qty</th><th class="num">Rate</th>${
        anyLineDiscount ? '<th class="num">Discount</th>' : ''
      }<th class="num">Tax</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>${invoice.taxMode === 'inclusive' ? 'Taxable value' : 'Subtotal'}</span><span>${money(invoice.subtotal)}</span></div>
      ${taxRows}
      ${invoice.discount > 0 ? `<div><span>Discount</span><span>- ${money(invoice.discount)}</span></div>` : ''}
      ${roundOff !== 0 ? `<div><span>Round off</span><span>${roundOff > 0 ? '+ ' : '- '}${money(Math.abs(roundOff))}</span></div>` : ''}
      <div class="grand"><span>Grand total</span><span>${money(Math.max(0, invoice.grandTotal))}</span></div>
    </div>

    ${summary ? `<div class="summary-title">Tax summary</div>${summary}` : ''}

    <div class="closing">
      <div class="closing-left">
        ${
          biz.terms
            ? `<div class="terms-title">Terms</div><div class="terms">${esc(biz.terms)}</div>`
            : ''
        }
      </div>
      ${payBlock(detail, biz)}
      <div class="sign">
        ${assets.signature ? `<img class="sign-img" src="${assets.signature}" />` : '<div class="sign-space"></div>'}
        <div class="sign-line">For ${esc(biz.name)}</div>
        <div class="muted">Authorised signatory</div>
      </div>
    </div>

    <div class="foot">
      ${invoice.taxMode === 'inclusive' ? 'Rates shown are inclusive of GST. · ' : ''}Generated by the billing app · This is a computer-generated document.
    </div>
  </body></html>`;
}

// ── Which paper ──────────────────────────────────────────────────────────────
// The shop tells the app once what it prints on (Settings → Paper size) and
// every Print/Share button in the app then does the right thing. That is why the
// choice is read here rather than offered as a second button: a counter that
// owns one printer should never be asked the same question twice a day.

/** Render the invoice to a PDF and open the native share sheet. */
export async function shareInvoicePdf(detail: InvoiceDetail): Promise<void> {
  if ((await getPrintFormat()) === 'thermal58') return shareThermalPdf(detail);
  const biz = await getBusinessProfile();
  const assets = await loadAssets(biz);
  const { uri } = await Print.printToFileAsync({ html: buildHtml(detail, biz, assets) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: detail.invoice.invoiceNo });
  }
}

/**
 * Open the OS print dialog for the invoice (Android print service / AirPrint).
 * From there the user can send it to any connected/Wi-Fi printer or save a PDF —
 * works in Expo Go, no thermal-printer native module needed.
 */
export async function printInvoice(detail: InvoiceDetail): Promise<void> {
  if ((await getPrintFormat()) === 'thermal58') return printThermal(detail);
  const biz = await getBusinessProfile();
  const assets = await loadAssets(biz);
  await Print.printAsync({ html: buildHtml(detail, biz, assets) });
}
