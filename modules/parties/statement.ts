// The party statement: every transaction with one customer or supplier on one
// page, ending in what is owed. It is what a shop sends when a customer asks
// "how did you get that figure?" — and the reason the balance is derived from
// transactions rather than stored is that this page has to prove it.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { imageDataUri } from '@/modules/settings/brandImages';
import { getBusinessProfile, type BusinessProfile } from '@/modules/settings/service';
import { balanceSummary, formatDate } from '@/utils/format';
import { escapeHtml as esc, htmlMoney as money } from '@/utils/html';
import { isWeb, printHtml } from '@/utils/webFile';
import type { LedgerEntry, PartyLedger } from '@/modules/parties/ledger';

/**
 * A ledger entry as a statement reads it. Money that increases what the party
 * owes is a debit; money that reduces it is a credit — the two columns an
 * accountant expects, taken from the one signed delta the ledger keeps.
 */
function row(entry: LedgerEntry): string {
  const debit = entry.delta > 0 ? money(entry.delta) : '';
  const credit = entry.delta < 0 ? money(-entry.delta) : '';
  return `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${esc(entry.label)}</td>
        <td class="num">${debit}</td>
        <td class="num">${credit}</td>
        <td class="num">${money(entry.balance)}</td>
      </tr>`;
}

function buildHtml(ledger: PartyLedger, biz: BusinessProfile, logo: string | null): string {
  const { party, entries, balance } = ledger;
  const summary = balanceSummary(balance);
  // The period the statement actually covers, taken from the entries themselves
  // rather than asked for — a statement of everything is what a shop means when
  // it says "send the account".
  const dated = entries.filter((e) => e.date);
  const first = dated.length ? formatDate(dated[0].date) : '';
  const last = dated.length ? formatDate(dated[dated.length - 1].date) : '';

  const debitTotal = entries.reduce((s, e) => s + (e.delta > 0 ? e.delta : 0), 0);
  const creditTotal = entries.reduce((s, e) => s + (e.delta < 0 ? -e.delta : 0), 0);

  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    * { font-family: -apple-system, Roboto, Arial, sans-serif; }
    body { color: #111; padding: 24px; font-size: 13px; }
    .doc { text-align: right; font-size: 18px; font-weight: 700; color: #208AEF; letter-spacing: 1px; }
    .biz { font-size: 20px; font-weight: 700; }
    .muted { color: #666; }
    .row { display: flex; justify-content: space-between; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border-bottom: 1px solid #e5e5e5; padding: 8px 6px; text-align: left; }
    th { background: #f4f8fe; font-size: 11px; text-transform: uppercase; color: #555; }
    .num { text-align: right; }
    tfoot td { font-weight: 700; border-bottom: none; border-top: 1px solid #ccc; }
    .closing { margin-top: 20px; margin-left: auto; width: 280px; border-top: 2px solid #111; padding-top: 10px; display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; }
    .head { display: flex; align-items: flex-start; gap: 14px; }
    .head-text { flex: 1; }
    .logo { width: 68px; height: 68px; object-fit: contain; }
    .foot { margin-top: 40px; color: #999; font-size: 11px; text-align: center; }
  </style></head><body>
    <div class="head">
      ${logo ? `<img class="logo" src="${logo}" />` : ''}
      <div class="head-text">
        <div class="biz">${esc(biz.name)}</div>
        ${biz.address ? `<div class="muted">${esc(biz.address)}</div>` : ''}
        ${biz.gstin ? `<div class="muted">GSTIN: ${esc(biz.gstin)}</div>` : ''}
        ${biz.phone ? `<div class="muted">${esc(biz.phone)}</div>` : ''}
      </div>
      <div class="doc">STATEMENT OF ACCOUNT</div>
    </div>

    <div class="row">
      <div>
        <div class="muted">Account of</div>
        <div style="font-weight:600">${esc(party.name)}</div>
        ${party.gstin ? `<div class="muted">GSTIN: ${esc(party.gstin)}</div>` : ''}
        ${party.phone ? `<div class="muted">${esc(party.phone)}</div>` : ''}
        ${party.address ? `<div class="muted">${esc(party.address)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div class="muted">${party.type === 'customer' ? 'Customer' : 'Supplier'}</div>
        ${first ? `<div class="muted">${first} — ${last}</div>` : ''}
      </div>
    </div>

    <table>
      <thead><tr>
        <th>Date</th><th>Particulars</th>
        <th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
      </tr></thead>
      <tbody>${entries.map(row).join('')}</tbody>
      <tfoot><tr>
        <td colspan="2">Total</td>
        <td class="num">${money(debitTotal)}</td>
        <td class="num">${money(creditTotal)}</td>
        <td class="num">${money(balance)}</td>
      </tr></tfoot>
    </table>

    <div class="closing">
      <span>${balance === 0 ? 'Settled' : summary.label}</span>
      <span>${money(Math.abs(balance))}</span>
    </div>

    <div class="foot">
      Generated by the billing app · This is a computer-generated statement.
    </div>
  </body></html>`;
}

/** Render the statement to a PDF and open the native share sheet. */
export async function sharePartyStatement(ledger: PartyLedger): Promise<void> {
  const biz = await getBusinessProfile();
  const logo = await imageDataUri(biz.logoUri);
  // A browser has no share sheet; its print dialog saves the PDF instead.
  if (isWeb) return printHtml(buildHtml(ledger, biz, logo));
  const { uri } = await Print.printToFileAsync({ html: buildHtml(ledger, biz, logo) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${ledger.party.name} — statement`,
    });
  }
}

/** Open the OS print dialog for the statement. */
export async function printPartyStatement(ledger: PartyLedger): Promise<void> {
  const biz = await getBusinessProfile();
  const logo = await imageDataUri(biz.logoUri);
  if (isWeb) return printHtml(buildHtml(ledger, biz, logo));
  await Print.printAsync({ html: buildHtml(ledger, biz, logo) });
}
