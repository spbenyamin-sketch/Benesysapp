// A manual stock correction overwrites the count AND records what it was, in
// one transaction, on a real SQLite database (see test-utils/fakeExpoSqlite).

jest.mock('expo-sqlite', () => require('@/test-utils/fakeExpoSqlite'));

import { applyAppMigrations, rawQuery } from '@/test-utils/fakeExpoSqlite';
import {
  adjustStock,
  createItem,
  deleteItem,
  getItem,
  listStockAdjustments,
} from '@/modules/items/service';

const count = () =>
  Number(rawQuery<{ n: number }>('select count(*) as n from stock_adjustments')[0].n);

beforeAll(() => {
  applyAppMigrations();
});

const freshItem = (name: string) => createItem({ name, openingStock: 10000, currentStock: 10000 });

describe('stock adjustments', () => {
  it('sets the stock and records old, new, delta and the reason', async () => {
    const item = await freshItem('Rice');
    const updated = await adjustStock(item.id, 7500, '  Damaged bag ');

    expect(updated?.currentStock).toBe(7500);
    expect((await getItem(item.id))!.currentStock).toBe(7500);
    const [row] = await listStockAdjustments(item.id);
    expect(row).toMatchObject({
      itemId: item.id,
      oldStock: 10000,
      newStock: 7500,
      delta: -2500,
      note: 'Damaged bag',
    });
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('lists newest first, and a blank reason is stored as nothing', async () => {
    const item = await freshItem('Dal');
    await adjustStock(item.id, 12000);
    await adjustStock(item.id, 11000, '   ');
    const rows = await listStockAdjustments(item.id);
    expect(rows.map((r) => r.delta)).toEqual([-1000, 2000]);
    expect(rows[0].note).toBeNull();
    expect(rows[1].oldStock).toBe(10000);
  });

  it('a correction to the same figure changes nothing and records nothing', async () => {
    const item = await freshItem('Salt');
    const before = count();
    await adjustStock(item.id, 10000);
    expect(count()).toBe(before);
  });

  it('an unknown item records nothing', async () => {
    const before = count();
    expect(await adjustStock(999999, 5000)).toBeUndefined();
    expect(count()).toBe(before);
  });

  it('deleting an item takes its corrections with it', async () => {
    const item = await freshItem('Tea');
    await adjustStock(item.id, 3000);
    await deleteItem(item.id);
    expect(await listStockAdjustments(item.id)).toHaveLength(0);
  });

  it('an item without corrections has no history to show', async () => {
    const item = await freshItem('Sugar');
    expect(await listStockAdjustments(item.id)).toEqual([]);
  });
});
