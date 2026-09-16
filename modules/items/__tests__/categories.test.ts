// The category list the item form offers, read back from a real SQLite database
// through the same driver the phone uses (see test-utils/fakeExpoSqlite). What
// it pins is that a category typed once is there to pick the next time, and
// that the same name in different case does not become two categories.

jest.mock('expo-sqlite', () => require('@/test-utils/fakeExpoSqlite'));

import { applyAppMigrations } from '@/test-utils/fakeExpoSqlite';
import { createItem, listCategories } from '@/modules/items/service';

beforeAll(() => {
  applyAppMigrations();
});

const add = (name: string, category: string | null) =>
  createItem({
    name,
    category,
    unit: 'pcs',
    salePrice: 1000,
    purchasePrice: 800,
    taxRate: 500,
    openingStock: 0,
    currentStock: 0,
  });

describe('the categories a shop has actually used', () => {
  it('starts with nothing to offer', async () => {
    await expect(listCategories()).resolves.toEqual([]);
  });

  it('offers a category as soon as one item carries it', async () => {
    await add('Rice 1kg', 'Kadai Saman');
    await expect(listCategories()).resolves.toEqual(['Kadai Saman']);
  });

  it('keeps one spelling when the same name is typed in another case', async () => {
    await add('Dal 1kg', 'kadai saman');
    await expect(listCategories()).resolves.toEqual(['Kadai Saman']);
  });

  it('ignores items left without a category, and blank ones', async () => {
    await add('Loose sugar', null);
    await add('Loose salt', '   ');
    await expect(listCategories()).resolves.toEqual(['Kadai Saman']);
  });

  it('sorts them, so the list does not reshuffle between visits', async () => {
    await add('Soap', 'Cleaning');
    await add('Pen', 'Stationery');
    await expect(listCategories()).resolves.toEqual(['Cleaning', 'Kadai Saman', 'Stationery']);
  });
});
