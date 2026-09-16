// Quick Bill (retail POS) flow for small shops/hotels: pick items by tapping
// tiles, then bill. A quick bill is always a cash sale paid in full immediately,
// attached to the shared Walk-in Customer — so stock decrements, "today's sales",
// and GST reports all stay correct without asking for a party each time.

import {
  createInvoiceWithItems,
  getInvoiceWithItems,
  type InvoiceDetail,
  type InvoiceLineInput,
} from '@/modules/invoices/service';
import { getOrCreateWalkInParty } from '@/modules/parties/service';
import { recordPayment } from '@/modules/payments/service';
import { getDefaultTaxMode } from '@/modules/settings/service';
import type { TaxMode } from '@/utils/gst';
import type { Item, Payment } from '@/db/schema';

export interface QuickCartLine {
  item: Item;
  qty: number; // whole/fractional units (converted to thousandths internally)
}

/**
 * Money off the whole quick bill, however the counter typed it: paise, or a
 * percentage in basis points (10% = 1000) which then decides the paise. Both are
 * kept, so a reprint still says "Discount (10%)" — see db/schema.ts.
 */
export interface QuickBillDiscount {
  amount: number; // paise
  percent?: number | null; // basis points
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create a paid retail bill from a tap-built cart and return the full detail
 * (for immediate print/share). Rate = item sale price, tax = item tax rate.
 *
 * `taxMode` decides whether the shelf price already contains GST (the usual case
 * for a hotel/retail counter) — when omitted it follows the app-wide default set
 * in Settings, so the counter never has to think about it.
 *
 * A `discount` comes off the whole bill after tax, and the payment recorded is
 * the discounted grand total: what the customer actually handed over.
 */
export async function createQuickBill(
  lines: QuickCartLine[],
  mode: Payment['mode'] = 'cash',
  taxMode?: TaxMode,
  discount?: QuickBillDiscount,
): Promise<InvoiceDetail> {
  if (lines.length === 0) throw new Error('Cart is empty.');
  const party = await getOrCreateWalkInParty();
  const date = todayISO();
  const effectiveTaxMode = taxMode ?? (await getDefaultTaxMode());

  const invLines: InvoiceLineInput[] = lines.map((l) => ({
    itemId: l.item.id,
    qty: Math.round(l.qty * 1000),
    rate: l.item.salePrice,
    taxRate: l.item.taxRate,
  }));

  const invoice = await createInvoiceWithItems(
    {
      type: 'sale',
      partyId: party.id,
      date,
      paymentStatus: 'unpaid',
      taxMode: effectiveTaxMode,
      discount: discount?.amount ?? 0,
      discountPercent: discount?.percent ?? null,
    },
    invLines,
  );
  // Paid in full, immediately — recompute sets paymentStatus to 'paid'.
  await recordPayment({
    partyId: party.id,
    invoiceId: invoice.id,
    amount: invoice.grandTotal,
    mode,
    direction: 'in',
    date,
  });

  const detail = await getInvoiceWithItems(invoice.id);
  if (!detail) throw new Error('Bill was created but could not be loaded.');
  return detail;
}
