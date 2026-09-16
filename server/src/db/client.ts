import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as controlSchema from './control-schema';
import * as shopSchema from './shop-schema';

// ─────────────────────────────────────────────────────────────────────────────
// Two ways into the database:
//
//   control — shops, users, sessions (the `public` schema). Used directly.
//   db      — ONE shop's books. This is what `@/db/client` means to the app's
//             service code when it runs on the server. It is not a connection
//             of its own: it forwards to the transaction opened by withShop()
//             for the current request, whose search_path is that shop's schema.
//
// Touching `db` outside withShop() throws instead of guessing a shop.
// ─────────────────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set (see server/.env.example).');

export const pool = new Pool({ connectionString });

export const control = drizzle(pool, { schema: controlSchema });

export type ShopDb = NodePgDatabase<typeof shopSchema>;
type ShopTx = Parameters<Parameters<ShopDb['transaction']>[0]>[0];

const current = new AsyncLocalStorage<ShopTx>();

/** The Postgres schema holding one shop's books. The id is ours, never user text. */
export function shopSchemaName(shopId: number): string {
  if (!Number.isSafeInteger(shopId) || shopId <= 0) throw new Error(`Bad shop id: ${shopId}`);
  return `shop_${shopId}`;
}

const shopDb: ShopDb = drizzle(pool, { schema: shopSchema });

/**
 * Run `fn` against one shop's books, in a single transaction: everything it
 * writes lands together or not at all. `search_path` is set LOCAL, so it ends
 * with the transaction and a pooled connection never carries a shop into the
 * next request. `public` is deliberately not on the path — a shop request has
 * no business with the users table.
 */
export function withShop<T>(shopId: number, fn: () => Promise<T>): Promise<T> {
  const schema = shopSchemaName(shopId);
  return shopDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('search_path', ${`"${schema}"`}, true)`);
    return current.run(tx, fn);
  });
}

export const db = new Proxy({} as ShopDb, {
  get(_target, prop) {
    const tx = current.getStore();
    if (!tx) {
      throw new Error('Shop data was touched outside withShop() — no shop is selected.');
    }
    const value = Reflect.get(tx, prop, tx);
    return typeof value === 'function' ? value.bind(tx) : value;
  },
});
