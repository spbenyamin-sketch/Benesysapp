// Almost every item in a small shop has NO barcode, so the dangerous case here
// is not a wrong match — it is a blank code being treated as a real one and
// opening whichever barcode-less item the database happens to return first.
// These run without a database: db/client answers from a list, and `eq` is
// reduced to "what was asked for", which is all the lookup rule depends on.

jest.mock('drizzle-orm', () => ({
  ...jest.requireActual('drizzle-orm'),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

jest.mock('@/db/client', () => {
  const state = {
    rows: [] as { id: number; name: string; barcode: string | null }[],
    asked: [] as unknown[],
  };
  return {
    __state: state,
    db: {
      select: () => ({
        from: () => ({
          where: (cond: { value: unknown }) => {
            state.asked.push(cond.value);
            return state.rows.filter((r) => r.barcode === cond.value);
          },
        }),
      }),
    },
    sqlite: {},
  };
});

import { findItemByBarcode } from '@/modules/items/service';

const state = (require('@/db/client') as { __state: any }).__state;

beforeEach(() => {
  state.rows = [
    { id: 1, name: 'Sugar 1kg', barcode: '8901234567890' },
    { id: 2, name: 'Loose rice', barcode: null },
    { id: 3, name: 'Tea 250g', barcode: null },
  ];
  state.asked = [];
});

describe('findItemByBarcode', () => {
  it('finds the item the code belongs to', async () => {
    expect(await findItemByBarcode('8901234567890')).toMatchObject({ id: 1 });
  });

  it('trims what the scanner padded on, so the same packet still matches', async () => {
    expect(await findItemByBarcode(' 8901234567890\n')).toMatchObject({ id: 1 });
  });

  it('matches nothing when no item carries the code', async () => {
    expect(await findItemByBarcode('4006381333931')).toBeUndefined();
  });

  it('never asks the database about a blank code', async () => {
    // Otherwise the two barcode-less items above would answer to a misread.
    expect(await findItemByBarcode('')).toBeUndefined();
    expect(await findItemByBarcode('   ')).toBeUndefined();
    expect(state.asked).toEqual([]);
  });
});
