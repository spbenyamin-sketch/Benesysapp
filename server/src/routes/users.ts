import { Hono } from 'hono';
import type { Role } from '../db/control-schema';
import { addUser, listUsers, updateUser } from '../auth/service';
import {
  readEmail,
  readOptionalName,
  readPassword,
  readScreens,
  readUsername,
} from '../auth/validate';
import { badRequest } from '../http/errors';
import { body, requireAuth, requireLicense, requireOwner, type AppEnv } from '../http/middleware';

function readRole(value: unknown, fallback?: Role): Role | undefined {
  if (value === undefined) return fallback;
  if (value === 'owner' || value === 'staff') return value;
  throw badRequest('Role must be owner or staff.');
}

// The shop's people. Owners only, and only on a licensed install — there is
// nothing to hire staff for while the app will not open.
export const userRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireOwner, requireLicense)

  .get('/', async (c) => c.json(await listUsers(c.var.auth.shop.id)))

  .post('/', async (c) => {
    const b = await body(c);
    const user = await addUser(c.var.auth.shop.id, {
      username: readUsername(b),
      email: readEmail(b, false),
      displayName: readOptionalName(b, 'displayName'),
      password: readPassword(b),
      role: readRole(b.role, 'staff')!,
      screens: readScreens(b.screens) ?? null,
    });
    return c.json(user, 201);
  })

  .patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isSafeInteger(id)) throw badRequest('Bad user id.');
    const b = await body(c);
    if (b.active !== undefined && typeof b.active !== 'boolean') {
      throw badRequest('active must be true or false.');
    }
    const user = await updateUser(c.var.auth, id, {
      displayName: b.displayName === undefined ? undefined : readOptionalName(b, 'displayName'),
      role: readRole(b.role),
      active: b.active as boolean | undefined,
      password: b.password === undefined ? undefined : readPassword(b),
      screens: readScreens(b.screens),
    });
    return c.json(user);
  });
