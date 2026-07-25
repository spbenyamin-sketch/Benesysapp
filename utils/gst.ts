// GST / invoice money math. Everything is integer — see db/schema.ts:
//   qty     → thousandths  (2.5 units = 2500)
//   rate    → paise/unit   (₹1.00 = 100)
//   taxRate → basis points (18% = 1800)
//   amount/tax/total → paise
// Keeping this pure (no DB) makes it trivially testable and reusable by the
// invoice form (live preview) and the service (persisted totals) alike.

/**
 * How the entered rate relates to GST:
 *   'exclusive' → rate is pre-tax, tax is ADDED on top   (₹100 + 18% = ₹118)
 *   'inclusive' → rate already CONTAINS the tax, so tax is BACKED OUT of it
 *                 (₹118 entered @18% → taxable ₹100 + tax ₹18)
 * Shops that quote round "counter prices" (hotels, retail) use inclusive;
 * B2B invoicing normally uses exclusive. Stored per invoice.
 */
export type TaxMode = 'exclusive' | 'inclusive';

export const TAX_MODE_LABEL: Record<TaxMode, string> = {
  exclusive: 'Tax extra (exclusive)',
  inclusive: 'Tax included in rate',
};

export interface LineInput {
  qty: number; // thousandths
  rate: number; // paise per unit
  taxRate: number; // basis points
}

export interface LineComputed extends LineInput {
  amount: number; // paise, ALWAYS pre-tax (taxable value) — this is what we store
  tax: number; // paise
  gross: number; // paise, amount + tax (what the customer pays for this line)
}

export interface InvoiceTotals {
  subtotal: number; // paise, pre-tax
  taxTotal: number; // paise
  discount: number; // paise
  grandTotal: number; // paise
}

/** Pre-tax line total in paise: (qty thousandths ÷ 1000) × rate paise. */
export function lineAmount(qty: number, rate: number): number {
  return Math.round((qty * rate) / 1000);
}

/** Tax on a pre-tax paise amount at a basis-point rate (1800 bp = 18%). */
export function lineTax(amount: number, taxRate: number): number {
  return Math.round((amount * taxRate) / 10000);
}

/**
 * Split a tax-INCLUSIVE paise amount into its taxable value and the tax inside it.
 * taxable = round(gross × 10000 ÷ (10000 + taxRate)); tax is the remainder, so
 * taxable + tax === gross exactly (no rounding leak on the customer-facing total).
 */
export function splitInclusive(gross: number, taxRate: number): { amount: number; tax: number } {
  if (taxRate <= 0) return { amount: gross, tax: 0 };
  const amount = Math.round((gross * 10000) / (10000 + taxRate));
  return { amount, tax: gross - amount };
}

export function computeLine(line: LineInput, taxMode: TaxMode = 'exclusive'): LineComputed {
  const raw = lineAmount(line.qty, line.rate);
  if (taxMode === 'inclusive') {
    const { amount, tax } = splitInclusive(raw, line.taxRate);
    return { ...line, amount, tax, gross: raw };
  }
  const tax = lineTax(raw, line.taxRate);
  return { ...line, amount: raw, tax, gross: raw + tax };
}

/**
 * Roll up line items into invoice totals. Discount is a flat paise amount
 * applied after tax; grandTotal is floored at 0 so an over-large discount can't
 * make a negative bill.
 *
 * Sanity (repeating-decimal 18% GST, per the plan's "No Error" checklist):
 *   line 3 units (qty=3000) @ ₹99.90 (rate=9990), 18% (taxRate=1800)
 *   amount = round(3000*9990/1000) = 29970 paise (₹299.70)
 *   tax    = round(29970*1800/10000) = round(5394.6) = 5395 paise (₹53.95)
 *   grand  = 29970 + 5395 = 35365 paise (₹353.65) — no float drift.
 *
 * Inclusive mode, same line entered as a ₹353.65-ish counter price:
 *   gross = round(3000*11790/1000) = 35370; taxable = round(35370*10000/11800)
 *         = 29975; tax = 35370 − 29975 = 5395 → grand back to 35370 exactly.
 */
export function computeTotals(
  lines: LineInput[],
  discount = 0,
  taxMode: TaxMode = 'exclusive',
): {
  lines: LineComputed[];
  totals: InvoiceTotals;
} {
  const computed = lines.map((l) => computeLine(l, taxMode));
  const subtotal = computed.reduce((s, l) => s + l.amount, 0);
  const taxTotal = computed.reduce((s, l) => s + l.tax, 0);
  const grandTotal = Math.max(0, subtotal + taxTotal - discount);
  return { lines: computed, totals: { subtotal, taxTotal, discount, grandTotal } };
}
