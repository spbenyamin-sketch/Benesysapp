import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { normaliseBarcode } from '@/modules/items/barcode';
import { items, type Item, type NewItem } from '@/db/schema';

export type ItemInput = Omit<NewItem, 'id' | 'createdAt'>;

export async function createItem(data: ItemInput): Promise<Item> {
  const [row] = await db.insert(items).values(data).returning();
  return row;
}

export async function listItems(): Promise<Item[]> {
  return db.select().from(items).orderBy(items.name);
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

// Manual stock correction: sets currentStock directly (thousandths). Phase 4+
// will move most stock movement to invoice-driven auto in/decrements; this stays
// the escape hatch for manual counts/corrections.
export async function adjustStock(id: number, newStock: number): Promise<Item | undefined> {
  const [row] = await db
    .update(items)
    .set({ currentStock: newStock })
    .where(eq(items.id, id))
    .returning();
  return row;
}
