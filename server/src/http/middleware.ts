import { isUsable } from '@/modules/license/status';
import { createMiddleware } from 'hono/factory';
import { licenseRefusal, licenseStatus } from '../auth/license';
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
 * The shop's own data and its people, only while this installation is licensed.
 *
 * The browser has its own gate (components/LicenseGate.web.tsx), but that is a
 * screen, and a screen in a bundle on the shop's own computer can be edited out.
 * This is the part that cannot: whatever reaches the API — a patched build, a
 * second browser, curl — an unlicensed install answers nothing. Sign-in and
 * /api/license stay open, or there would be no way to activate it.
 */
export const requireLicense = createMiddleware<AppEnv>(async (c, next) => {
  const status = await licenseStatus();
  if (!isUsable(status)) throw new ApiError(403, licenseRefusal(status));
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
