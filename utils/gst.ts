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

// ── CGST / SGST / IGST presentation split ─────────────────────────────────────
// Nothing above this line changes: the stored tax figure is a single number, and
// this is only about how a GST invoice has to PRINT it. One supply, one tax —
// either halved into the central + state share (both parties in one state), or
// carried whole as IGST (the goods crossed a state line).

/** Which pair of taxes a supply attracts. */
export type SupplyType = 'intra' | 'inter';

/**
 * A tax amount as it appears on the face of an invoice. Exactly one of the two
 * shapes is non-zero: intra → cgst + sgst, inter → igst. In every case
 * `cgst + sgst + igst === tax`, so the printed rows always re-add to the total.
 */
export interface TaxSplit {
  supply: SupplyType;
  tax: number; // paise, the whole tax that was split
  cgst: number; // paise
  sgst: number; // paise
  igst: number; // paise
}

/** Trimmed, lower-cased state name; '' when there is nothing usable. */
const normaliseState = (state?: string | null): string => (state ?? '').trim().toLowerCase();

/**
 * Intra- or inter-state, decided from the seller's and the buyer's state.
 *
 * A blank/unknown state on either side reads as INTRA-state. That is the safe
 * default for the shop this app is for: almost every bill is a local one, and
 * CGST+SGST is what a walk-in customer with no address on the bill expects. It
 * also means a shop that never fills in its state keeps printing what it printed
 * before this feature existed.
 */
export function supplyType(sellerState?: string | null, buyerState?: string | null): SupplyType {
  const seller = normaliseState(sellerState);
  const buyer = normaliseState(buyerState);
  if (!seller || !buyer) return 'intra';
  return seller === buyer ? 'intra' : 'inter';
}

/**
 * Split a tax amount for display. Intra-state halves it into CGST and SGST, with
 * the odd paise given to SGST so the two halves add back to the exact tax (the
 * same convention as the rate-wise breakup in modules/reports/service.ts).
 * Inter-state carries the whole amount as IGST.
 */
export function splitTax(tax: number, supply: SupplyType): TaxSplit {
  if (supply === 'inter') return { supply, tax, cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.round(tax / 2);
  return { supply, tax, cgst, sgst: tax - cgst, igst: 0 };
}

/** Convenience: decide the supply type from the two states, then split. */
export function splitTaxForStates(
  tax: number,
  sellerState?: string | null,
  buyerState?: string | null,
): TaxSplit {
  return splitTax(tax, supplyType(sellerState, buyerState));
}
