import { needsReorder, stockLevel } from '@/modules/items/stockLevel';

// "Running low" is a badge the shopkeeper sees on the shelf list every day, so
// it has to mean something. The rule that keeps it meaningful: a reorder level
// of 0 (which every item starts at) never makes anything low.

const item = (currentStock: number, minStock = 0) => ({ currentStock, minStock });

describe('stockLevel', () => {
  it('calls an empty shelf out, whatever the reorder level says', () => {
    expect(stockLevel(item(0))).toBe('out');
    expect(stockLevel(item(0, 5000))).toBe('out');
    // Oversold — the shelf owes stock, which is emptier than empty.
    expect(stockLevel(item(-2000, 5000))).toBe('out');
  });

  it('calls an item low at its reorder level, not below it', () => {
    // At the level IS the moment to reorder.
    expect(stockLevel(item(5000, 5000))).toBe('low');
    expect(stockLevel(item(4000, 5000))).toBe('low');
    expect(stockLevel(item(5001, 5000))).toBe('ok');
  });

  it('leaves an item with no reorder level alone until the shelf is empty', () => {
    // This is every item before the feature existed — nothing changes for them.
    expect(stockLevel(item(1))).toBe('ok');
    expect(stockLevel(item(999999))).toBe('ok');
  });
});

describe('needsReorder', () => {
  it('covers both the empty and the low shelves', () => {
    expect(needsReorder(item(0))).toBe(true);
    expect(needsReorder(item(3000, 5000))).toBe(true);
    expect(needsReorder(item(9000, 5000))).toBe(false);
    expect(needsReorder(item(9000))).toBe(false);
  });
});
