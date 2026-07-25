import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { parties, type NewParty, type Party } from '@/db/schema';
import { getSetting, setSetting } from '@/modules/settings/service';

// createdAt is DB-generated; callers never supply id/createdAt.
export type PartyInput = Omit<NewParty, 'id' | 'createdAt'>;

// Anonymous retail sales (Quick Bill) need a party because invoices.party_id is
// NOT NULL. We keep a single shared "Walk-in Customer" and remember its id in
// settings so quick bills all attach to it (its ledger nets to zero since every
// quick bill is paid in full immediately).
const WALKIN_KEY = 'walkin_party_id';

export async function getOrCreateWalkInParty(): Promise<Party> {
  const savedId = await getSetting(WALKIN_KEY);
  if (savedId) {
    const existing = await getParty(Number(savedId));
    if (existing) return existing;
  }
  const created = await createParty({ name: 'Walk-in Customer', type: 'customer' });
  await setSetting(WALKIN_KEY, String(created.id));
  return created;
}

export async function createParty(data: PartyInput): Promise<Party> {
  const [row] = await db.insert(parties).values(data).returning();
  return row;
}

export async function listParties(): Promise<Party[]> {
  return db.select().from(parties).orderBy(parties.name);
}

export async function getParty(id: number): Promise<Party | undefined> {
  const [row] = await db.select().from(parties).where(eq(parties.id, id));
  return row;
}

export async function updateParty(id: number, data: Partial<PartyInput>): Promise<Party | undefined> {
  const [row] = await db.update(parties).set(data).where(eq(parties.id, id)).returning();
  return row;
}

export async function deleteParty(id: number): Promise<void> {
  await db.delete(parties).where(eq(parties.id, id));
}
