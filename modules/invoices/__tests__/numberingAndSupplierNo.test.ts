// Two small additions to a bill: the sale numbering a shop can carry on from
// another app, and the supplier's own number on a purchase.

jest.mock('expo-sqlite', () => require('@/test-utils/fakeExpoSqlite'));

import { applyAppMigrations } from '@/test-utils/fakeExpoSqlite';
import {
  createInvoiceWithItems,
  getInvoice,
  listInvoicesWithParty,
  nextDocumentNo,
  updateInvoiceWithItems,
} from '@/modules/invoices/service';
import { createItem } from '@/modules/items/service';
import { createParty } from '@/modules/parties/service';
import {
  getSaleStartNo,
  parseSaleStartNo,
  setSaleStartNo,
  setSetting,
} from '@/modules/settings/service';
import { financialYear } from '@/utils/invoiceNumber';

describe('nextDocumentNo', () => {
  const jul = new Date(2026, 6, 5); // FY 2026-27
  const start = { fy: '2026-27', from: 501 };

  it('starts a sale at the starting number when nothing is higher', () => {
    expect(nextDocumentNo('sale', [], jul, null, start)).toBe('INV/2026-27/501');
    expect(nextDocumentNo('sale', ['INV/2026-27/003'], jul, null, start)).toBe('INV/2026-27/501');
  });

  it('carries on from existing numbers once they pass it', () => {
    expect(nextDocumentNo('sale', ['INV/2026-27/501'], jul, null, start)).toBe('INV/2026-27/502');
    expect(nextDocumentNo('sale', ['INV/2026-27/900'], jul, null, start)).toBe('INV/2026-27/901');
  });

  it('applies only to sales, and only in the year it was set for', () => {
    expect(nextDocumentNo('purchase', [], jul, null, start)).toBe('PUR/2026-27/001');
    expect(nextDocumentNo('sale', [], new Date(2027, 3, 1), null, start)).toBe('INV/2027-28/001');
  });

  it('respects the sale prefix', () => {
    expect(nextDocumentNo('sale', [], jul, 'BENE', start)).toBe('BENE/2026-27/501');
  });

  it('without a starting number behaves exactly as before', () => {
    expect(nextDocumentNo('sale', ['INV/2026-27/001'], jul)).toBe('INV/2026-27/002');
  });
});

describe('parseSaleStartNo', () => {
  it('reads the stored year and number, and ignores garbage', () => {
    expect(parseSaleStartNo('2026-27:501')).toEqual({ fy: '2026-27', from: 501 });
    expect(parseSaleStartNo('501')).toBeNull();
    expect(parseSaleStartNo('2026-27:1')).toBeNull();
    expect(parseSaleStartNo(undefined)).toBeNull();
  });
});

describe('on SQLite', () => {
  let customer = 0;
  let supplier = 0;
  let itemId = 0;
  const line = () => [{ itemId, qty: 1000, rate: 10000, taxRate: 0 }];

  beforeAll(async () => {
    applyAppMigrations();
    customer = (await createParty({ name: 'Ravi', type: 'customer' })).id;
    supplier = (await createParty({ name: 'Metro', type: 'supplier' })).id;
    itemId = (await createItem({ name: 'Rice', currentStock: 100000 })).id;
  });

  it('the next sale takes the starting number set in Settings', async () => {
    const fy = financialYear(new Date()).label;
    await setSaleStartNo(fy, 501);
    expect(await getSaleStartNo()).toEqual({ fy, from: 501 });
    await setSetting('sale_prefix', '');

    const a = await createInvoiceWithItems({ type: 'sale', partyId: customer, date: '2026-09-15' }, line());
    const b = await createInvoiceWithItems({ type: 'sale', partyId: customer, date: '2026-09-15' }, line());
    expect(a.invoiceNo).toBe(`INV/${fy}/501`);
    expect(b.invoiceNo).toBe(`INV/${fy}/502`);

    await setSaleStartNo(fy, null);
    expect(await getSaleStartNo()).toBeNull();
  });

  it('a purchase keeps the supplier bill number, an edit keeps or changes it', async () => {
    const inv = await createInvoiceWithItems(
      { type: 'purchase', partyId: supplier, date: '2026-09-15', supplierInvoiceNo: ' MT/889 ' },
      line(),
    );
    expect(inv.supplierInvoiceNo).toBe('MT/889');

    await updateInvoiceWithItems(inv.id, { partyId: supplier, date: '2026-09-16' }, line());
    expect((await getInvoice(inv.id))!.supplierInvoiceNo).toBe('MT/889');

    await updateInvoiceWithItems(
      inv.id,
      { partyId: supplier, date: '2026-09-16', supplierInvoiceNo: '' },
      line(),
    );
    expect((await getInvoice(inv.id))!.supplierInvoiceNo).toBeNull();

    const listed = await listInvoicesWithParty();
    expect(listed.find((r) => r.id === inv.id)).toHaveProperty('supplierInvoiceNo', null);
  });

  it('a sale never stores one', async () => {
    const inv = await createInvoiceWithItems(
      { type: 'sale', partyId: customer, date: '2026-09-15', supplierInvoiceNo: 'X/1' },
      line(),
    );
    expect(inv.supplierInvoiceNo).toBeNull();
  });
});
