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
