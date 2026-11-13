import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context } from 'hono';
import {
  canRegisterShop,
  changePassword,
  registerShop,
  signIn,
  signOut,
} from '../auth/service';
import {
  readEmail,
  readName,
  readOptionalName,
  readPassword,
  readUsername,
} from '../auth/validate';
import { body, requireAuth, type AppEnv } from '../http/middleware';

/**
 * The caller's socket address, for the per-computer sign-in limit. Outside a
 * real Node server (app.request in the tests, with no env) there is no socket,
 * and every such caller shares one bucket.
 */
function clientIp(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export const authRoutes = new Hono<AppEnv>()
  // Whether the sign-in page should offer "Register your shop" at all — only on
  // a fresh install. Open to anyone: the answer is a yes or a no.
  .get('/setup', async (c) => c.json({ canRegister: await canRegisterShop() }))

  // A new shop and its owner. Refused once the server has one (auth/service.ts).
  .post('/register', async (c) => {
    const b = await body(c);
    const signedIn = await registerShop({
      shopName: readName(b, 'shopName', 'Shop name'),
      username: readUsername(b),
      email: readEmail(b, true)!,
      password: readPassword(b),
      displayName: readOptionalName(b, 'displayName'),
    });
    return c.json(signedIn, 201);
  })

  .post('/login', async (c) => {
    const b = await body(c);
    const identifier = typeof b.identifier === 'string' ? b.identifier : '';
    const password = typeof b.password === 'string' ? b.password : '';
    return c.json(await signIn(identifier, password, clientIp(c)));
  })

  .post('/logout', requireAuth, async (c) => {
    await signOut(c.var.auth);
    return c.body(null, 204);
  })

  .get('/me', requireAuth, (c) => {
    const { user, shop } = c.var.auth;
    return c.json({ user, shop });
  })

  .post('/password', requireAuth, async (c) => {
    const b = await body(c);
    const current = typeof b.current === 'string' ? b.current : '';
    await changePassword(c.var.auth, current, readPassword(b, 'next'));
    return c.body(null, 204);
  });
