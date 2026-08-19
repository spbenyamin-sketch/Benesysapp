// Shared helpers for the documents the app prints (invoice, party statement).
// One escaper, so a party called "Raj & Co <Chennai>" can never come out of one
// document intact and out of another as broken markup.

import { formatMoney } from '@/utils/format';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** paise → "₹1,234.00". A stray NaN from old data must never reach the paper. */
export function htmlMoney(paise: number): string {
  return formatMoney(Number.isFinite(paise) ? Math.round(paise) : 0);
}
