// Just enough of expo-sqlite's synchronous API, over Node's own SQLite, for
// drizzle's real expo-sqlite driver to run in Jest. The app's services then
// execute genuine SQL against a genuine SQLite database — same dialect, same
// foreign keys, same transactions as the phone — instead of a hand-written
// recorder that can only agree with whatever the test author expected.
//
// Usage, at the top of a test file:
//   jest.mock('expo-sqlite', () => require('@/test-utils/fakeExpoSqlite'));

import { readFileSync } from 'fs';
import path from 'path';

// Loaded this way because Jest's module registry doesn't know `node:sqlite`.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

type Param = string | number | bigint | null | Uint8Array;

let current: InstanceType<typeof DatabaseSync> | null = null;

function toParams(params: unknown[] | undefined): Param[] {
  return (params ?? []).map((p) =>
    typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : (p as Param),
  );
}

export function openDatabaseSync() {
  const raw = new DatabaseSync(':memory:');
  current = raw;
  return {
    execSync(source: string) {
      raw.exec(source);
    },
    prepareSync(source: string) {
      const stmt = raw.prepare(source);
      const returnsRows = stmt.columns().length > 0;
      return {
        executeSync(params?: unknown[]) {
          const args = toParams(params);
          if (!returnsRows) {
            const r = stmt.run(...args);
            return {
              changes: Number(r.changes),
              lastInsertRowId: Number(r.lastInsertRowid),
              getAllSync: () => [],
              getFirstSync: () => null,
            };
          }
          stmt.setReturnArrays(false);
          const rows = stmt.all(...args);
          return {
            changes: 0,
            lastInsertRowId: 0,
            getAllSync: () => rows,
            getFirstSync: () => rows[0] ?? null,
          };
        },
        executeForRawResultSync(params?: unknown[]) {
          stmt.setReturnArrays(true);
          const rows = stmt.all(...toParams(params));
          stmt.setReturnArrays(false);
          return { getAllSync: () => rows };
        },
        finalizeSync() {},
      };
    },
  };
}

/** Apply the app's real migrations, in journal order, to the open database. */
export function applyAppMigrations() {
  if (!current) throw new Error('db/client has not opened the database yet.');
  const dir = path.join(__dirname, '../db/migrations');
  const journal = JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) {
    for (const statement of readFileSync(path.join(dir, `${tag}.sql`), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      if (statement.trim()) current.exec(statement);
    }
  }
}

/** Direct SQL, for tests that want to look at the tables themselves. */
export function rawQuery<T = Record<string, unknown>>(source: string, ...params: Param[]): T[] {
  if (!current) throw new Error('db/client has not opened the database yet.');
  return current.prepare(source).all(...params) as T[];
}
