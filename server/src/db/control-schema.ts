import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────────────────────
// The control plane, in the `public` schema: who the shops are, who may sign in
// to each, and which shop-schema migrations each shop has had. A shop's actual
// books live in its own schema — see shop-schema.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const shops = pgTable('shops', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  shopId: integer('shop_id')
    .notNull()
    .references(() => shops.id, { onDelete: 'cascade' }),
  // Stored lower-cased; unique across every shop, so a sign-in never has to ask
  // which shop the person belongs to. Counter staff rarely have an email.
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  // owner: everything, including managing the other users. staff: the billing.
  role: text('role', { enum: ['owner', 'staff'] }).notNull().default('staff'),
  // Which tabs this person may open (modules/auth/screens.ts). NULL is nobody
  // having restricted them yet, which means all of them; an owner ignores it.
  screens: text('screens').array(),
  // A person who has left is switched off, not deleted — their name stays on
  // whatever they billed.
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  // sha256 of the bearer token. The token itself is never stored, so a leaked
  // copy of this table signs nobody in.
  tokenHash: text('token_hash').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * This installation's licence — one row, ever, for the whole server.
 *
 * It lives in the control schema rather than in a shop's own, because what is
 * licensed is the install: a second shop registered on an unlicensed server must
 * not become a second free copy. See modules/license/serverLicense.ts for why
 * the identity is a seed in this database and not a fingerprint of the machine.
 */
export const serverLicense = pgTable('server_license', {
  // Always 1. A primary key with one permitted value is the cheapest way to say
  // "one row" to Postgres — an insert that races another one simply conflicts.
  id: integer('id').primaryKey(),
  // Random, written once on first start, never shown raw: the Server ID the
  // owner sends to the vendor is a hash of it.
  seed: text('seed').notNull(),
  // The verified licence as JSON — re-verified on every check, never trusted.
  license: text('license'),
  // ISO date of the last check, for the clock-rollback rule.
  lastSeen: text('last_seen'),
  installedAt: timestamp('installed_at', { withTimezone: true }),
});

export const shopMigrations = pgTable(
  'shop_migrations',
  {
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.tag] })],
);

export type Shop = typeof shops.$inferSelect;
export type User = typeof users.$inferSelect;
export type Role = User['role'];
