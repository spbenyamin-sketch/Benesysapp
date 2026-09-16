import { formatTaxRate } from '@/utils/format';

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

/**
 * What a discount calls itself: `Discount (10%)` when that is how the shop typed
 * it, and the bare `Discount` a bill in rupees has always carried.
 *
 * One function for the screen, the A4 sheet and the counter slip alike, so none
 * of the three can tell a customer something the others don't.
 */
export function discountLabel(percent?: number | null): string {
  return percent ? `Discount (${formatTaxRate(percent)})` : 'Discount';
}

export interface LineInput {
  qty: number; // thousandths
  rate: number; // paise per unit
  taxRate: number; // basis points
  /** Money knocked off THIS line, paise, before tax — the "₹5 off the tea" a
   *  counter gives on one item rather than on the whole bill. */
  discount?: number;
  /** Set when the discount was typed as a percentage instead: basis points
   *  (10% = 1000), off the line's pre-tax value. It WINS over `discount`, which
   *  is then the paise it works out to — see discountFromPercent. */
  discountPercent?: number | null;
}

export interface LineComputed extends LineInput {
  /** The line discount actually applied: never negative, never more than the
   *  line is worth (a bigger one would turn the line into a refund). */
  discount: number; // paise
  amount: number; // paise, ALWAYS pre-tax (taxable value) AND already net of `discount` — this is what we store
  tax: number; // paise
  gross: number; // paise, amount + tax (what the customer pays for this line)
}

export interface InvoiceTotals {
  subtotal: number; // paise, pre-tax, net of line discounts
  taxTotal: number; // paise
  discount: number; // paise, the bill-level discount
  /** Paise added or taken off to land the bill on a whole rupee. */
  roundOff: number;
  grandTotal: number; // paise, a whole number of rupees
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

/**
 * What a percentage discount is worth, in paise, on a base of paise.
 *
 * Percentages are basis points like every other rate here (10% = 1000), and the
 * paise this returns is what gets stored and totalled — the percent itself is
 * only how the shopkeeper said it and what the bill prints. Rounded to the
 * nearest paise, so "10% of ₹99.99" is ₹10.00 and not a third of a paisa that
 * every total downstream would have to carry.
 */
export function discountFromPercent(base: number, percent: number): number {
  return Math.round((Math.max(0, base) * Math.max(0, percent)) / 10000);
}

/**
 * A line's discount, clamped to something that can actually be given away: never
 * negative, never more than the line is worth. A discount larger than the line
 * would otherwise make the shop pay the customer for taking the goods.
 */
export function cappedLineDiscount(discount: number | undefined, base: number): number {
  return Math.min(Math.max(0, discount ?? 0), Math.max(0, base));
}

/**
 * Round a paise figure to the nearest whole rupee. Half a rupee goes up, which
 * is what a counter does with a ₹0.50 — and what the customer expects to see.
 */
export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}

/**
 * One line, discount taken off FIRST and tax charged on what is left — the only
 * order GST allows: a discount given at the time of the sale reduces the taxable
 * value, so the tax follows the money that actually changed hands.
 */
export function computeLine(line: LineInput, taxMode: TaxMode = 'exclusive'): LineComputed {
  const base = lineAmount(line.qty, line.rate);
  const asked =
    line.discountPercent != null ? discountFromPercent(base, line.discountPercent) : line.discount;
  const discount = cappedLineDiscount(asked, base);
  const raw = base - discount;
  if (taxMode === 'inclusive') {
    const { amount, tax } = splitInclusive(raw, line.taxRate);
    return { ...line, discount, amount, tax, gross: raw };
  }
  const tax = lineTax(raw, line.taxRate);
  return { ...line, discount, amount: raw, tax, gross: raw + tax };
}

/**
 * Roll up line items into invoice totals. `discount` here is the BILL-level one,
 * a flat paise amount applied after tax (line discounts are already inside each
 * line's amount); the total is floored at 0 so an over-large discount can't make
 * a negative bill, then landed on a whole rupee. `discountPercent`, when given,
 * says the shop typed a percentage instead and the paise are derived from it.
 *
 * The rounding is deliberately invisible: nobody at a counter hands over 65
 * paise, so the bill is rounded for them and the difference is carried in
 * `roundOff` — which means subtotal + tax − discount + roundOff === grandTotal,
 * exactly, on every printed bill.
 *
 * Sanity (repeating-decimal 18% GST, per the plan's "No Error" checklist):
 *   line 3 units (qty=3000) @ ₹99.90 (rate=9990), 18% (taxRate=1800)
 *   amount = round(3000*9990/1000) = 29970 paise (₹299.70)
 *   tax    = round(29970*1800/10000) = round(5394.6) = 5395 paise (₹53.95)
 *   net    = 29970 + 5395 = 35365 paise (₹353.65) — no float drift
 *   grand  = 35400 (₹354.00), roundOff = +35 paise.
 *
 * Inclusive mode, same line entered as a ₹353.65-ish counter price:
 *   gross = round(3000*11790/1000) = 35370; taxable = round(35370*10000/11800)
 *         = 29975; tax = 35370 − 29975 = 5395 → net back to 35370 exactly.
 */
export function computeTotals(
  lines: LineInput[],
  discount = 0,
  taxMode: TaxMode = 'exclusive',
  discountPercent?: number | null,
): {
  lines: LineComputed[];
  totals: InvoiceTotals;
} {
  const computed = lines.map((l) => computeLine(l, taxMode));
  const subtotal = computed.reduce((s, l) => s + l.amount, 0);
  const taxTotal = computed.reduce((s, l) => s + l.tax, 0);
  // "10% off the bill" is 10% of what the customer would otherwise pay, so the
  // base is the taxed total the discount is about to come off. The paise it
  // works out to is what the rest of this function — and the stored invoice —
  // then treats as the discount; the percentage is not money.
  const given =
    discountPercent != null ? discountFromPercent(subtotal + taxTotal, discountPercent) : discount;
  const net = Math.max(0, subtotal + taxTotal - given);
  const grandTotal = roundToRupee(net);
  return {
    lines: computed,
    totals: { subtotal, taxTotal, discount: given, roundOff: grandTotal - net, grandTotal },
  };
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
