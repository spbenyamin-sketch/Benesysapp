// When an item needs buying again. One rule, in one place, so the Items tab, the
// stock report and the item screen can never disagree about what "low" means.
//
// `items.min_stock` is the reorder level and defaults to 0, which is what every
// item meant before it existed: only an empty shelf counts. A shop that never
// sets one therefore sees exactly what it saw before.

export type StockLevel = 'out' | 'low' | 'ok';

export interface StockLike {
  currentStock: number; // thousandths
  minStock: number; // thousandths
}

export const STOCK_LABEL: Record<StockLevel, string> = {
  out: 'Out of stock',
  low: 'Running low',
  ok: 'in stock',
};

export const STOCK_TONE: Record<StockLevel, string> = {
  out: '#c0392b',
  low: '#d68910',
  ok: '#111',
};

/**
 * An empty shelf is always "out", whatever the reorder level says. Otherwise an
 * item is "low" only once a level has been set and the stock has reached it —
 * at the level, not below it, because that is the moment to reorder.
 */
export function stockLevel(item: StockLike): StockLevel {
  if (item.currentStock <= 0) return 'out';
  if (item.minStock > 0 && item.currentStock <= item.minStock) return 'low';
  return 'ok';
}

/** Everything that wants buying: empty shelves and items at their reorder level. */
export function needsReorder(item: StockLike): boolean {
  return stockLevel(item) !== 'ok';
}
