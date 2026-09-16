import { db, type ShopDb } from './client';

// What `@/db/atomic` means on the server. The app's bodies (see the app's
// db/atomic.ts) yield drizzle statements; here each one is awaited inside a
// Postgres transaction — a savepoint within the request's own transaction, so
// a failed body undoes only itself and the request can still report it.

export type Tx = Parameters<Parameters<ShopDb['transaction']>[0]>[0];

/** A drizzle statement: awaiting it runs it (rows, when there is RETURNING). */
export type Statement = PromiseLike<unknown>;

export type AtomicBody<T> = (tx: Tx) => Generator<Statement, T, any[]>;

export async function atomic<T>(body: AtomicBody<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const steps = body(tx);
    let step = steps.next();
    while (!step.done) step = steps.next((await step.value) as any[]);
    return step.value;
  });
}
