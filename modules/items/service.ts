import { desc, eq, isNotNull } from 'drizzle-orm';
import { atomic } from '@/db/atomic';
import { db } from '@/db/client';
import { normaliseBarcode } from '@/modules/items/barcode';
import {
  items,
  stockAdjustments,
  type Item,
  type NewItem,
  type StockAdjustment,
} from '@/db/schema';

export type ItemInput = Omit<NewItem, 'id' | 'createdAt'>;

export async function createItem(data: ItemInput): Promise<Item> {
  const [row] = await db.insert(items).values(data).returning();
  return row;
}

export async function listItems(): Promise<Item[]> {
  return db.select().from(items).orderBy(items.name);
}

/**
 * Every category the shop has actually used. The form offers these alongside
 * the presets, so a category typed once for one item is there to pick the next
 * time instead of being retyped — which is how "Kadai Saman" and "kadai saman"
 * become two categories that mean one thing.
 *
 * When both spellings are already in the books the older item's wins, because
 * that is the one the shop chose; reading in id order is what makes the answer
 * the same every time rather than whatever the database hands back first.
 */
export async function listCategories(): Promise<string[]> {
  const rows = await db
    .select({ category: items.category })
    .from(items)
    .where(isNotNull(items.category))
    .orderBy(items.id);
  const seen = new Map<string, string>();
  for (const { category } of rows) {
    const name = category?.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export async function getItem(id: number): Promise<Item | undefined> {
  const [row] = await db.select().from(items).where(eq(items.id, id));
  return row;
}

// What a scan resolves to. A blank code matches nothing on purpose: almost every
// item in a small shop has no barcode at all, so a misread must never be allowed
// to open whichever of those rows the database happens to hand back first.
export async function findItemByBarcode(code: string): Promise<Item | undefined> {
  const barcode = normaliseBarcode(code);
  if (!barcode) return undefined;
  const [row] = await db.select().from(items).where(eq(items.barcode, barcode));
  return row;
}

export async function updateItem(id: number, data: Partial<ItemInput>): Promise<Item | undefined> {
  const [row] = await db.update(items).set(data).where(eq(items.id, id)).returning();
  return row;
}

export async function deleteItem(id: number): Promise<void> {
  await db.delete(items).where(eq(items.id, id));
}

// Manual stock correction: sets currentStock directly (thousandths). Bills move
// stock on their own; this is the escape hatch for a recount or a breakage. The
// overwrite and its record land together or not at all, and the old figure is
// read INSIDE that same transaction, so the history always adds up.
export async function adjustStock(
  id: number,
  newStock: number,
  note?: string | null,
): Promise<Item | undefined> {
  return atomic(function* (tx) {
    const [current]: { currentStock: number }[] = yield tx
      .select({ currentStock: items.currentStock })
      .from(items)
      .where(eq(items.id, id));
    if (!current) return undefined;
    const [row]: Item[] = yield tx
      .update(items)
      .set({ currentStock: newStock })
      .where(eq(items.id, id))
      .returning();
    const delta = newStock - current.currentStock;
    // "Set to" the figure already on the shelf changed nothing worth recording.
    if (delta !== 0) {
      yield tx.insert(stockAdjustments).values({
        itemId: id,
        oldStock: current.currentStock,
        newStock,
        delta,
        note: note?.trim() || null,
      });
    }
    return row;
  });
}

/** The manual corrections made to one item, newest first. */
export async function listStockAdjustments(itemId: number, limit = 20): Promise<StockAdjustment[]> {
  return db
    .select()
    .from(stockAdjustments)
    .where(eq(stockAdjustments.itemId, itemId))
    .orderBy(desc(stockAdjustments.createdAt), desc(stockAdjustments.id))
    .limit(limit);
}
