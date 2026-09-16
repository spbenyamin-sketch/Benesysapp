import type { Item } from '@/db/schema';

/**
 * What Enter in the Quick Bill search box should put on the bill.
 *
 * A barcode scanner types the code and presses Enter itself, so the code is
 * tried first and against every item, not just the ones on screen: a scanned
 * number must never be read as a fuzzy name match. Then an exact name, so "Tea"
 * reaches Tea and not Tea Cup. Failing both, the item at the top of what is
 * already on screen — the one the counter is looking at.
 *
 * `visible` is the filtered grid, in the order it is drawn.
 */
export function pickSearchHit(all: Item[], visible: Item[], query: string): Item | undefined {
  const term = query.trim().toLowerCase();
  if (!term) return undefined;
  return (
    all.find((item) => (item.barcode ?? '').trim().toLowerCase() === term) ??
    visible.find((item) => item.name.trim().toLowerCase() === term) ??
    visible[0]
  );
}
