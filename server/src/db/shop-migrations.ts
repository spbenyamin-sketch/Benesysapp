import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { shopSchemaName } from './client';

// drizzle-kit writes the shop migrations for a single schema, `public`. Each
// shop needs them applied to its own schema instead, and each shop remembers
// (in public.shop_migrations) which ones it already has — a shop created today
// and a shop created a year ago must both end up on the same tables.

const DIR = path.join(__dirname, '../../drizzle/shop');

interface Migration {
  tag: string;
  statements: string[];
}

function loadMigrations(): Migration[] {
  const journal = JSON.parse(readFileSync(path.join(DIR, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map(({ tag }) => ({
      tag,
      statements: readFileSync(path.join(DIR, `${tag}.sql`), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean),
    }));
}

/**
 * Bring one shop's schema up to date, creating it if needed. Runs inside the
 * caller's transaction so a new shop and its tables appear together.
 */
export async function migrateShop(tx: PgDatabase<any, any, any>, shopId: number): Promise<string[]> {
  const schema = shopSchemaName(shopId);
  await tx.execute(sql.raw(`create schema if not exists "${schema}"`));
  await tx.execute(sql`select set_config('search_path', ${`"${schema}"`}, true)`);

  const done = await tx.execute(
    sql`select tag from public.shop_migrations where shop_id = ${shopId}`,
  );
  const applied = new Set((done.rows as { tag: string }[]).map((r) => r.tag));

  const ran: string[] = [];
  for (const m of loadMigrations()) {
    if (applied.has(m.tag)) continue;
    for (const statement of m.statements) {
      // drizzle-kit qualifies foreign-key targets as "public"."table".
      await tx.execute(sql.raw(statement.replaceAll('"public".', `"${schema}".`)));
    }
    await tx.execute(
      sql`insert into public.shop_migrations (shop_id, tag) values (${shopId}, ${m.tag})`,
    );
    ran.push(m.tag);
  }
  await tx.execute(sql`select set_config('search_path', 'public', true)`);
  return ran;
}
