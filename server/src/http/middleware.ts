import { createMiddleware } from 'hono/factory';
import { resolveSession, type AuthContext } from '../auth/service';
import { withShop } from '../db/client';
import { ApiError } from './errors';

export type AppEnv = { Variables: { auth: AuthContext } };

/** A valid bearer token, or 401. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const auth = token ? await resolveSession(token) : null;
  if (!auth) throw new ApiError(401, 'Please sign in again.');
  c.set('auth', auth);
  await next();
});

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.auth.user.role !== 'owner') {
    throw new ApiError(403, 'Only the shop owner can do that.');
  }
  await next();
});

/**
 * Everything after this runs against the signed-in person's own shop, in one
 * transaction. Hono turns a thrown error into a response before control comes
 * back here, so the error is re-thrown by hand — otherwise the transaction
 * would commit whatever the failed request had half-written.
 */
export const inShop = createMiddleware<AppEnv>(async (c, next) => {
  await withShop(c.var.auth.shop.id, async () => {
    await next();
    if (c.error) throw c.error;
  });
});

/** The JSON body as a plain object; anything else is an empty one. */
export async function body(c: { req: { json: () => Promise<unknown> } }) {
  const b = await c.req.json().catch(() => ({}));
  return (b && typeof b === 'object' && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
}
