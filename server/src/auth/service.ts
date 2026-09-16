import { createHash, randomBytes } from 'node:crypto';
import { isScreen, type Screen } from '@/modules/auth/screens';
import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';
import { control } from '../db/client';
import { sessions, shops, users, type Role, type Shop, type User } from '../db/control-schema';
import { migrateShop } from '../db/shop-migrations';
import { ApiError, badRequest, uniqueViolation } from '../http/errors';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a signed-in person looks like to the API — never the password hash. */
export interface PublicUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  active: boolean;
  /** Tabs this person may open; null is unrestricted. Owners ignore it. */
  screens: Screen[] | null;
}

export interface AuthContext {
  user: PublicUser;
  shop: { id: number; name: string };
  tokenHash: string;
}

export interface SignedIn {
  token: string;
  user: PublicUser;
  shop: { id: number; name: string };
}

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    // A screen dropped from a later version of the app is simply gone.
    screens: u.screens === null ? null : u.screens.filter(isScreen),
  };
}

const publicShop = (s: Shop) => ({ id: s.id, name: s.name });

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function translateUnique(err: unknown): never {
  const constraint = uniqueViolation(err);
  if (constraint === 'users_username_unique') throw new ApiError(409, 'That username is taken.');
  if (constraint === 'users_email_unique') {
    throw new ApiError(409, 'An account already uses that email.');
  }
  throw err;
}

async function openSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await control.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
  });
  return token;
}

// ── Shop sign-up ─────────────────────────────────────────────────────────────

/**
 * A new shop, its owner, and its empty books — all or nothing. A shop without
 * tables, or an owner without a shop, is never left behind by a failure halfway.
 */
export async function registerShop(input: {
  shopName: string;
  username: string;
  email: string;
  password: string;
  displayName: string | null;
}): Promise<SignedIn> {
  const passwordHash = await hashPassword(input.password);
  const { shop, owner } = await control
    .transaction(async (tx) => {
      const [shop] = await tx.insert(shops).values({ name: input.shopName }).returning();
      const [owner] = await tx
        .insert(users)
        .values({
          shopId: shop.id,
          username: input.username,
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          role: 'owner',
        })
        .returning();
      await migrateShop(tx, shop.id);
      return { shop, owner };
    })
    .catch(translateUnique);

  return { token: await openSession(owner.id), user: publicUser(owner), shop: publicShop(shop) };
}

// ── Sign-in ──────────────────────────────────────────────────────────────────

// Wrong passwords per identifier. In memory: a restart forgets them, which is
// acceptable for slowing down guessing on a single server.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; since: number }>();

function checkThrottle(key: string) {
  const f = failures.get(key);
  if (!f) return;
  if (Date.now() - f.since > LOCK_MS) {
    failures.delete(key);
    return;
  }
  if (f.count >= MAX_FAILURES) {
    throw new ApiError(429, 'Too many wrong attempts. Try again in 15 minutes.');
  }
}

function noteFailure(key: string) {
  const f = failures.get(key);
  if (f && Date.now() - f.since <= LOCK_MS) f.count += 1;
  else failures.set(key, { count: 1, since: Date.now() });
}

/** Accepts the username or the email, like the app's own sign-in. */
export async function signIn(identifier: string, password: string): Promise<SignedIn> {
  const key = identifier.trim().toLowerCase();
  if (!key || !password) throw badRequest('Enter your username and password.');
  checkThrottle(key);

  const [row] = await control
    .select({ user: users, shop: shops })
    .from(users)
    .innerJoin(shops, eq(users.shopId, shops.id))
    .where(key.includes('@') ? eq(users.email, key) : eq(users.username, key));

  const ok = await verifyPassword(password, row?.user.passwordHash ?? (await DUMMY_HASH));
  if (!row || !ok) {
    noteFailure(key);
    throw new ApiError(401, 'Wrong username or password.');
  }
  // Checked only after the password, so it can't be used to probe usernames.
  if (!row.user.active) throw new ApiError(403, 'This account has been switched off by the owner.');

  failures.delete(key);
  return {
    token: await openSession(row.user.id),
    user: publicUser(row.user),
    shop: publicShop(row.shop),
  };
}

/** The person behind a bearer token, or null if it is unknown, expired or disabled. */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  const tokenHash = hashToken(token);
  const [row] = await control
    .select({ user: users, shop: shops, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(shops, eq(users.shopId, shops.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`)));
  if (!row || !row.user.active) return null;

  // Sliding expiry: someone who opens the app daily is never signed out, and the
  // row is rewritten at most once a day rather than on every request.
  const renewAt = Date.now() + (SESSION_DAYS - 1) * DAY_MS;
  if (row.expiresAt.getTime() < renewAt) {
    await control
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) })
      .where(eq(sessions.tokenHash, tokenHash));
  }
  return { user: publicUser(row.user), shop: publicShop(row.shop), tokenHash };
}

export async function signOut(auth: AuthContext): Promise<void> {
  await control.delete(sessions).where(eq(sessions.tokenHash, auth.tokenHash));
}

export async function changePassword(auth: AuthContext, current: string, next: string) {
  const [u] = await control.select().from(users).where(eq(users.id, auth.user.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) {
    throw badRequest('Current password is wrong.');
  }
  await control
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, u.id));
  // Every other device signed in as this person is signed out; this one stays.
  await control
    .delete(sessions)
    .where(and(eq(sessions.userId, u.id), ne(sessions.tokenHash, auth.tokenHash)));
}

// ── The owner managing the shop's people ─────────────────────────────────────

export async function listUsers(shopId: number): Promise<PublicUser[]> {
  const rows = await control
    .select()
    .from(users)
    .where(eq(users.shopId, shopId))
    .orderBy(asc(users.id));
  return rows.map(publicUser);
}

export async function addUser(
  shopId: number,
  input: {
    username: string;
    email: string | null;
    displayName: string | null;
    password: string;
    role: Role;
    screens: Screen[] | null;
  },
): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  const [u] = await control
    .insert(users)
    .values({ shopId, ...input, passwordHash })
    .returning()
    .catch(translateUnique);
  return publicUser(u);
}

export async function updateUser(
  auth: AuthContext,
  userId: number,
  change: {
    displayName?: string | null;
    role?: Role;
    active?: boolean;
    password?: string;
    screens?: Screen[] | null;
  },
): Promise<PublicUser> {
  const [target] = await control
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.shopId, auth.shop.id)));
  // Another shop's user is reported exactly like a missing one.
  if (!target) throw new ApiError(404, 'No such user in this shop.');

  const losesOwner =
    target.role === 'owner' &&
    ((change.role !== undefined && change.role !== 'owner') || change.active === false);
  if (losesOwner) {
    if (target.id === auth.user.id) {
      throw badRequest('You cannot remove your own owner access. Ask another owner.');
    }
  }

  const set: Partial<typeof users.$inferInsert> = {};
  if (change.displayName !== undefined) set.displayName = change.displayName;
  if (change.role !== undefined) set.role = change.role;
  if (change.active !== undefined) set.active = change.active;
  if (change.password !== undefined) set.passwordHash = await hashPassword(change.password);
  if (change.screens !== undefined) set.screens = change.screens;

  const updated = await control.transaction(async (tx) => {
    // One change to a shop's people at a time. Without the lock, two owners
    // removing each other at the same moment would each still count the other
    // and leave a shop nobody can manage.
    await tx.select({ id: shops.id }).from(shops).where(eq(shops.id, auth.shop.id)).for('update');
    const [u] = await tx.update(users).set(set).where(eq(users.id, userId)).returning();
    if (losesOwner) {
      const [{ owners }] = await tx
        .select({ owners: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.shopId, auth.shop.id), eq(users.role, 'owner'), eq(users.active, true)));
      if (owners === 0) throw badRequest('A shop needs at least one active owner.');
    }
    // Switched off or given a new password by the owner: signed out everywhere.
    if (change.active === false || change.password !== undefined) {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    }
    return u;
  });
  return publicUser(updated);
}
