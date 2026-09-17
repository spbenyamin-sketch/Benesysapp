// Everything the Tally file needs, in one read of the books.
//
// The structure is loadGstrInvoices' (modules/reports/service.ts): one query for
// the heads, one for their lines, one for the bills the returns reverse, then a
// fan-out in memory. What it cannot borrow is the query itself — GSTR-1 is
// outward supply only, so the purchase side, the payments and the overheads have
// no loader anywhere in the app.
//
// This file is swapped for a network call on web (metro.config.js → the list in
// scripts/online-services.js), which is why the builder lives in build.ts and
// imports nothing from here.

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  bankAccounts,
  expenses,
  invoiceItems,
  invoices,
  parties,
  payments,
} from '@/db/schema';
import { getBusinessProfile } from '@/modules/settings/service';
import type {
  TallyExpense,
  TallyInvoice,
  TallyParty,
  TallyPayload,
  TallyPayment,
} from './types';

/** The four documents that are accounting entries. A quotation is a promise and
 *  a delivery challan is a movement; neither belongs in anyone's books. */
const VOUCHER_TYPES = ['sale', 'purchase', 'saleReturn', 'purchaseReturn'] as const;

export async function loadTallyExport(from: string, to: string): Promise<TallyPayload> {
  const business = await getBusinessProfile();

  const heads = await db
    .select({
      id: invoices.id,
      type: invoices.type,
      invoiceNo: invoices.invoiceNo,
      date: invoices.date,
      partyId: invoices.partyId,
      subtotal: invoices.subtotal,
      taxTotal: invoices.taxTotal,
      discount: invoices.discount,
      roundOff: invoices.roundOff,
      grandTotal: invoices.grandTotal,
      placeOfSupply: invoices.placeOfSupply,
      sourceInvoiceId: invoices.sourceInvoiceId,
      accounted: invoices.accounted,
    })
    .from(invoices)
    .where(
      and(
        inArray(invoices.type, [...VOUCHER_TYPES]),
        gte(invoices.date, from),
        lte(invoices.date, to),
        eq(invoices.accounted, true),
      ),
    );

  const ids = heads.map((h) => h.id);
  const lines = ids.length
    ? await db
        .select({
          invoiceId: invoiceItems.invoiceId,
          taxRate: invoiceItems.taxRate,
          amount: invoiceItems.amount,
        })
        .from(invoiceItems)
        .where(inArray(invoiceItems.invoiceId, ids))
    : [];

  // The bill a credit note gives back is usually in an earlier month, so the
  // originals are fetched by id rather than hunted for in this range.
  const sourceIds = [
    ...new Set(heads.map((h) => h.sourceInvoiceId).filter((v): v is number => v != null)),
  ];
  const sources = sourceIds.length
    ? await db
        .select({ id: invoices.id, invoiceNo: invoices.invoiceNo, date: invoices.date })
        .from(invoices)
        .where(inArray(invoices.id, sourceIds))
    : [];
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const linesByInvoice = new Map<number, { taxRate: number; amount: number }[]>();
  for (const { invoiceId, ...line } of lines) {
    linesByInvoice.set(invoiceId, [...(linesByInvoice.get(invoiceId) ?? []), line]);
  }

  const invoiceRows: TallyInvoice[] = heads.map((h) => {
    const source = h.sourceInvoiceId != null ? sourceById.get(h.sourceInvoiceId) : undefined;
    return {
      id: h.id,
      type: h.type as TallyInvoice['type'],
      invoiceNo: h.invoiceNo,
      date: h.date,
      partyId: h.partyId,
      subtotal: h.subtotal,
      taxTotal: h.taxTotal,
      discount: h.discount,
      roundOff: h.roundOff,
      grandTotal: h.grandTotal,
      placeOfSupply: h.placeOfSupply,
      lines: linesByInvoice.get(h.id) ?? [],
      sourceInvoiceNo: source?.invoiceNo ?? null,
      sourceDate: source?.date ?? null,
      accounted: h.accounted,
    };
  });

  const paymentRows = await db
    .select({
      id: payments.id,
      partyId: payments.partyId,
      amount: payments.amount,
      mode: payments.mode,
      direction: payments.direction,
      date: payments.date,
      notes: payments.notes,
      accounted: payments.accounted,
      accountName: bankAccounts.name,
      accountType: bankAccounts.type,
      invoiceNo: invoices.invoiceNo,
      partyType: parties.type,
    })
    .from(payments)
    .innerJoin(parties, eq(payments.partyId, parties.id))
    .leftJoin(bankAccounts, eq(payments.accountId, bankAccounts.id))
    .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(gte(payments.date, from), lte(payments.date, to), eq(payments.accounted, true)));

  const paymentList: TallyPayment[] = paymentRows.map((p) => ({
    id: p.id,
    partyId: p.partyId,
    amount: p.amount,
    mode: p.mode,
    // Rows written before the column existed say nothing; the party decides,
    // exactly as paymentDirection() does everywhere else in the app.
    direction: p.direction ?? (p.partyType === 'supplier' ? 'out' : 'in'),
    date: p.date,
    notes: p.notes,
    accountName: p.accountName,
    accountType: p.accountType,
    invoiceNo: p.invoiceNo,
    accounted: p.accounted,
  }));

  const expenseRows = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      amount: expenses.amount,
      taxRate: expenses.taxRate,
      date: expenses.date,
      notes: expenses.notes,
      accounted: expenses.accounted,
      accountName: bankAccounts.name,
      accountType: bankAccounts.type,
    })
    .from(expenses)
    .leftJoin(bankAccounts, eq(expenses.accountId, bankAccounts.id))
    .where(and(gte(expenses.date, from), lte(expenses.date, to), eq(expenses.accounted, true)));

  const expenseList: TallyExpense[] = expenseRows.map((e) => ({ ...e }));

  // Only the parties this period actually traded with: a shop with four thousand
  // customers does not hand its accountant four thousand ledgers for one month.
  const partyIds = [
    ...new Set([...invoiceRows.map((i) => i.partyId), ...paymentList.map((p) => p.partyId)]),
  ];
  const partyRows = partyIds.length
    ? await db
        .select({
          id: parties.id,
          name: parties.name,
          type: parties.type,
          gstin: parties.gstin,
          state: parties.state,
          address: parties.address,
          city: parties.city,
          phone: parties.phone,
        })
        .from(parties)
        .where(inArray(parties.id, partyIds))
    : [];

  return {
    from,
    to,
    business: {
      name: business.name,
      // A shop that never filled these in still gets a file; blank is what the
      // GST helpers already read as unknown, and they treat it as local.
      gstin: business.gstin ?? '',
      state: business.state ?? '',
    },
    parties: partyRows as TallyParty[],
    invoices: invoiceRows,
    payments: paymentList,
    expenses: expenseList,
  };
}

/**
 * What the export screen shows before anything is written: how much of the
 * period the shop has kept out of its books. The vouchers themselves are counted
 * from the built file (modules/tally/build tallyCounts), which cannot disagree
 * with what is in it.
 */
export async function countLeftOut(
  from: string,
  to: string,
): Promise<{ count: number; total: number }> {
  const [bills, paid, spent] = await Promise.all([
    db
      .select({ grandTotal: invoices.grandTotal })
      .from(invoices)
      .where(
        and(
          inArray(invoices.type, [...VOUCHER_TYPES]),
          gte(invoices.date, from),
          lte(invoices.date, to),
          eq(invoices.accounted, false),
        ),
      ),
    db
      .select({ amount: payments.amount })
      .from(payments)
      .where(and(gte(payments.date, from), lte(payments.date, to), eq(payments.accounted, false))),
    db
      .select({ amount: expenses.amount })
      .from(expenses)
      .where(and(gte(expenses.date, from), lte(expenses.date, to), eq(expenses.accounted, false))),
  ]);
  const rows = [
    ...bills.map((b) => b.grandTotal),
    ...paid.map((p) => p.amount),
    ...spent.map((e) => e.amount),
  ];
  return { count: rows.length, total: rows.reduce((s, v) => s + v, 0) };
}
