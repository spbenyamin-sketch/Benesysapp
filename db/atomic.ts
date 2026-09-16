import { db } from '@/db/client';

// A write that must land whole, written ONCE for both databases the app's
// services run on.
//
// The body is a generator: it `yield`s each statement and gets that
// statement's rows back (so `const [row] = yield tx.insert(…).returning()`).
// Here, on the phone, expo-sqlite's transactions are synchronous, so every
// statement is executed on the spot inside one. The server maps `@/db/atomic`
// to its own driver (server/src/db/atomic.ts), which awaits each statement
// inside a Postgres transaction instead. The business logic in the body never
// knows which one it is running on.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything a body may yield: a drizzle insert/update/delete/select. Every one
 * of them is executed with `.all()`, which on this driver runs any statement
 * and returns its rows ([] when there is no RETURNING). drizzle's types only
 * admit `.all()` after `.returning()`, hence the loose signature.
 */
export interface Statement {
  all: (...args: any[]) => unknown;
}

export type AtomicBody<T> = (tx: Tx) => Generator<Statement, T, any[]>;

export async function atomic<T>(body: AtomicBody<T>): Promise<T> {
  return db.transaction((tx) => {
    const steps = body(tx);
    let step = steps.next();
    while (!step.done) step = steps.next(step.value.all() as unknown[]);
    return step.value;
  });
}
