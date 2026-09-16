import { pickSearchHit } from '@/modules/pos/search';
import type { Item } from '@/db/schema';

// Only the three fields the pick looks at matter; the rest of an Item is filled
// in so the type is honest.
const item = (id: number, name: string, barcode: string | null = null): Item =>
  ({
    id,
    name,
    barcode,
    hsnCode: null,
    category: null,
    unit: 'pcs',
    salePrice: 0,
    purchasePrice: 0,
    taxRate: 0,
    openingStock: 0,
    currentStock: 0,
    minStock: 0,
    voiceAlias: null,
    imageUri: null,
    createdAt: '2026-09-16',
  }) as unknown as Item;

const TEA = item(1, 'Tea', '8901234567890');
const TEA_CUP = item(2, 'Tea Cup');
const SUGAR = item(3, 'Sugar', '8909999999999');
const ALL = [TEA, TEA_CUP, SUGAR];

describe('what Enter in the Quick Bill search adds', () => {
  it('bills the scanned item even when the grid is showing something else', () => {
    // A scanner fires the code with nothing typed, so the grid is unfiltered.
    expect(pickSearchHit(ALL, ALL, '8909999999999')).toBe(SUGAR);
  });

  it('reads a code as a code, never as a name to match loosely', () => {
    // Sugar is not on screen; its barcode must still win.
    expect(pickSearchHit(ALL, [TEA, TEA_CUP], '8909999999999')).toBe(SUGAR);
  });

  it('prefers the exact name over the longer one that also matches', () => {
    expect(pickSearchHit(ALL, [TEA, TEA_CUP], 'tea')).toBe(TEA);
    expect(pickSearchHit(ALL, [TEA, TEA_CUP], 'TEA')).toBe(TEA);
  });

  it('takes the top of the grid when nothing matches exactly', () => {
    expect(pickSearchHit(ALL, [TEA_CUP], 'cup')).toBe(TEA_CUP);
  });

  it('adds nothing on an empty box or a term that matches nothing', () => {
    expect(pickSearchHit(ALL, ALL, '   ')).toBeUndefined();
    expect(pickSearchHit(ALL, [], 'biscuit')).toBeUndefined();
  });

  it('does not let an item without a barcode answer a scan of a blank code', () => {
    // Every field is compared lower-cased and trimmed; a null barcode is "".
    expect(pickSearchHit([TEA_CUP], [], '')).toBeUndefined();
  });
});
