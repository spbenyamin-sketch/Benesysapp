import { Hono } from 'hono';
import { installLicense, licenseStatus } from '../auth/license';
import { badRequest } from '../http/errors';
import { body, requireAuth, requireOwner, type AppEnv } from '../http/middleware';

// This installation's licence. Deliberately NOT behind requireLicense — it is
// the one door an unlicensed server has to leave open, or nobody could ever
// activate it.
//
// Reading needs a sign-in even so: the Server ID is what a licence is bound to,
// and there is no reason to hand it, or the shop's expiry date, to anyone who
// can reach the port. Installing needs the owner, like every other decision that
// is the shop's rather than the counter's.

export const licenseRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  .get('/', async (c) => c.json(await licenseStatus()))

  .post('/', requireOwner, async (c) => {
    const b = await body(c);
    const text = typeof b.license === 'string' ? b.license.trim() : '';
    if (!text) throw badRequest('Paste the licence the vendor sent you.');
    return c.json(await installLicense(text));
  });
