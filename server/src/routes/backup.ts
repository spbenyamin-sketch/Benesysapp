import { Hono } from 'hono';
import { backupNow, backupStatus } from '../backup/pgDump';
import { requireAuth, requireOwner, type AppEnv } from '../http/middleware';

// The server's daily database backup, as Settings shows it to the owner: when
// the last one was taken, where it is, and whether the last try failed.
//
// Not behind requireLicense: a shop whose licence has lapsed still owns its
// books, and copying them out is the last thing that should be refused.

export const backupRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireOwner)

  .get('/', async (c) => c.json(await backupStatus()))

  .post('/', async (c) => {
    await backupNow();
    return c.json(await backupStatus());
  });
