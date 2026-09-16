// The three writes that must land whole — create, edit and delete of a bill —
// run here against a real SQLite database through drizzle's real expo-sqlite
// driver (see test-utils/fakeExpoSqlite). What they pin is what the phone
// relies on: the totals, the frozen cost and HSN, the stock moving exactly
// once, and a failure halfway leaving nothing behind.

jest.mock('expo-sqlite', () => require('@/test-utils/fakeExpoSqlite'));

import { applyAppMigrations, rawQuery } from '@/test-utils/fakeExpoSqlite';
import {
  createInvoiceWithItems,
  deleteInvoiceWithItems,
  getInvoice,
  listInvoiceItems,
  updateInvoiceWithItems,
} from '@/modules/invoices/service';
import { createItem, getItem, updateItem } from '@/modules/items/service';
import { createParty } from '@/modules/parties/service';
import { listPaymentsByInvoice, recordPayment } from '@/modules/payments/service';

const count = (table: string) =>
  Number(rawQuery<{ n: number }>(`select count(*) as n from ${table}`)[0].n);

let partyId = 0;
let supplierId = 0;

beforeAll(async () => {
  applyAppMigrations();
  partyId = (await createParty({ name: 'Ravi', type: 'customer' })).id;
  supplierId = (await createParty({ name: 'Wholesale Co', type: 'supplier' })).id;
});

async function freshItem(name: string) {
  return createItem({
    name,
    hsnCode: '1001',
    salePrice: 10000,
    purchasePrice: 6000,
    taxRate: 1800,
    openingStock: 10000,
    currentStock: 10000,
  });
}

describe('bill writes on SQLite', () => {
  it('creates a sale with its lines, frozen cost and HSN, and takes the stock', async () => {
    const item = await freshItem('Rice');
    const inv = await createInvoiceWithItems(
      { type: 'sale', partyId, date: '2026-09-15' },
      [{ itemId: item.id, qty: 2000, rate: 10000, taxRate: 1800 }],
    );

    expect(inv.id).toBeGreaterThan(0);
    expect(inv.invoiceNo).toBeTruthy();
    expect(inv.subtotal).toBe(20000);
    expect(inv.taxTotal).toBe(3600);
    expect(inv.grandTotal).toBe(23600);

    const lines = await listInvoiceItems(inv.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: 2000, amount: 20000, costPrice: 6000, hsnCode: '1001' });
    expect((await getItem(item.id))!.currentStock).toBe(8000);
  });

  it('a purchase brings stock in and carries the price paid back onto the item', async () => {
    const item = await freshItem('Dal');
    await createInvoiceWithItems(
      { type: 'purchase', partyId: supplierId, date: '2026-09-15' },
      [{ itemId: item.id, qty: 5000, rate: 7000, taxRate: 0 }],
    );
    const after = (await getItem(item.id))!;
    expect(after.currentStock).toBe(15000);
    expect(after.purchasePrice).toBe(7000);
  });

  it('an edit puts the old stock back, applies the new lines once, and keeps the frozen cost', async () => {
    const item = await freshItem('Sugar');
    const inv = await createInvoiceWithItems(
      { type: 'sale', partyId, date: '2026-09-15' },
      [{ itemId: item.id, qty: 2000, rate: 10000, taxRate: 1800 }],
    );
    await updateItem(item.id, { purchasePrice: 9999 });

    const edited = await updateInvoiceWithItems(
      inv.id,
      { partyId, date: '2026-09-16' },
      [{ itemId: item.id, qty: 3000, rate: 10000, taxRate: 1800 }],
    );

    expect(edited.invoiceNo).toBe(inv.invoiceNo);
    expect(edited.date).toBe('2026-09-16');
    expect(edited.grandTotal).toBe(35400);
    const lines = await listInvoiceItems(inv.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: 3000, costPrice: 6000 });
    expect((await getItem(item.id))!.currentStock).toBe(7000);
  });

  it('deleting a paid bill takes its receipt and lines with it and restores the stock', async () => {
    const item = await freshItem('Oil');
    const inv = await createInvoiceWithItems(
      { type: 'sale', partyId, date: '2026-09-15' },
      [{ itemId: item.id, qty: 4000, rate: 10000, taxRate: 1800 }],
    );
    await recordPayment({
      partyId,
      invoiceId: inv.id,
      amount: inv.grandTotal,
      mode: 'cash',
      direction: 'in',
      date: '2026-09-15',
    });
    expect((await getInvoice(inv.id))!.paymentStatus).toBe('paid');

    await deleteInvoiceWithItems(inv.id);

    expect(await getInvoice(inv.id)).toBeUndefined();
    expect(await listInvoiceItems(inv.id)).toHaveLength(0);
    expect(await listPaymentsByInvoice(inv.id)).toHaveLength(0);
    expect((await getItem(item.id))!.currentStock).toBe(10000);
  });

  it('a create that fails on its second line leaves no bill, no lines and no stock movement', async () => {
    const item = await freshItem('Salt');
    const before = { invoices: count('invoices'), lines: count('invoice_items') };

    await expect(
      createInvoiceWithItems({ type: 'sale', partyId, date: '2026-09-15' }, [
        { itemId: item.id, qty: 1000, rate: 10000, taxRate: 1800 },
        { itemId: 999999, qty: 1000, rate: 10000, taxRate: 1800 },
      ]),
    ).rejects.toThrow();

    expect(count('invoices')).toBe(before.invoices);
    expect(count('invoice_items')).toBe(before.lines);
    expect((await getItem(item.id))!.currentStock).toBe(10000);
  });

  it('an edit that fails leaves the original bill and stock exactly as they were', async () => {
    const item = await freshItem('Tea');
    const inv = await createInvoiceWithItems(
      { type: 'sale', partyId, date: '2026-09-15' },
      [{ itemId: item.id, qty: 2000, rate: 10000, taxRate: 1800 }],
    );

    await expect(
      updateInvoiceWithItems(inv.id, { partyId, date: '2026-09-20' }, [
        { itemId: item.id, qty: 5000, rate: 10000, taxRate: 1800 },
        { itemId: 999999, qty: 1000, rate: 10000, taxRate: 1800 },
      ]),
    ).rejects.toThrow();

    const kept = (await getInvoice(inv.id))!;
    expect(kept.date).toBe('2026-09-15');
    expect(kept.grandTotal).toBe(23600);
    const lines = await listInvoiceItems(inv.id);
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(2000);
    expect((await getItem(item.id))!.currentStock).toBe(8000);
  });
});
