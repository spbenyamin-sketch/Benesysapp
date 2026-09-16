import { Hono } from 'hono';
import {
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

export const authRoutes = new Hono<AppEnv>()
  // A new shop and its owner.
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
    return c.json(await signIn(identifier, password));
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
