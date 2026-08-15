// Per-financial-year invoice numbering. Indian FY runs 1 Apr → 31 Mar.
// Numbers look like  SALE/2026-27/001  — prefix by type, FY label, zero-padded
// sequence. invoice_no is app-generated and never user-editable after creation
// (see db/schema.ts). Pure/stateless so the service owns the DB read; this file
// just computes labels and the next sequence from what already exists.

import type { Invoice } from '@/db/schema';

export type InvoiceType = Invoice['type']; // sale | purchase | quotation | challan | saleReturn

// Default prefixes; a user-set prefix (Phase 8 business profile) overrides the
// sale prefix only — the others stay stable so document types never collide.
// A sale return is numbered as a credit note, in its own series: it must never
// share a number with the sale it reverses.
const DEFAULT_PREFIX: Record<InvoiceType, string> = {
  sale: 'INV',
  purchase: 'PUR',
  quotation: 'QTN',
  challan: 'DC',
  saleReturn: 'CN',
};

export function prefixFor(type: InvoiceType, saleOverride?: string | null): string {
  if (type === 'sale' && saleOverride && saleOverride.trim()) return saleOverride.trim();
  return DEFAULT_PREFIX[type];
}

/** Financial-year label + ISO bounds for a date. 5 Jul 2026 → "2026-27". */
export function financialYear(date: Date): { label: string; start: string; end: string } {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // month 3 = April
  const endYear = startYear + 1;
  const label = `${startYear}-${String(endYear).slice(-2)}`;
  return { label, start: `${startYear}-04-01`, end: `${endYear}-03-31` };
}

export function formatInvoiceNo(prefix: string, fyLabel: string, seq: number): string {
  return `${prefix}/${fyLabel}/${String(seq).padStart(3, '0')}`;
}

/**
 * Next sequence for a given prefix + FY, derived from the max sequence already
 * used (not a count — so deleting an invoice never re-issues its number).
 */
export function nextSequence(existingNos: string[], prefix: string, fyLabel: string): number {
  const head = `${prefix}/${fyLabel}/`;
  let max = 0;
  for (const no of existingNos) {
    if (!no.startsWith(head)) continue;
    const seq = parseInt(no.slice(head.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max + 1;
}

/** Convenience: full next number from existing invoice numbers of the same type. */
export function nextInvoiceNo(
  type: InvoiceType,
  existingNos: string[],
  now: Date,
  saleOverride?: string | null,
): string {
  const prefix = prefixFor(type, saleOverride);
  const { label } = financialYear(now);
  return formatInvoiceNo(prefix, label, nextSequence(existingNos, prefix, label));
}
