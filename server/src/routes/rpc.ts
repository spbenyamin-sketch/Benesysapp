import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { allowedScreens, type Screen } from '@/modules/auth/screens';
import { db } from '../db/client';
import { ApiError, badRequest } from '../http/errors';
import { body, inShop, requireAuth, requireLicense, type AppEnv } from '../http/middleware';
import { registry } from '../rpc/registry';

/**
 * Hiding a tab is what the owner asked for; this is what makes it stick when
 * somebody skips the screens and calls the API directly.
 *
 * Only modules that belong to one part of the app can be gated. Items, parties,
 * invoices, payments and the shop's settings are all needed to put a bill
 * together, so a counter person reaches them whatever tabs they were given —
 * what is withheld is the takings. `reports` is the shop's money: sales, profit,
 * GST, expenses, bank accounts. The dashboard shows a slice of it too, so
 * either tab opens it.
 */
const MODULE_SCREENS: Partial<Record<string, readonly Screen[]>> = {
  reports: ['reports', 'dashboard'],
};

// POST /api/rpc/:module/:fn  { args: [...], undef: [indices] }  →  { result }
//
// Runs one of the app's own service functions, unchanged, against the signed-in
// person's shop and inside that request's transaction. Only what the generated
// registry lists can be named here — never an arbitrary export.

export const rpcRoutes = new Hono<AppEnv>()
  .use(requireAuth, requireLicense, inShop)

  .post('/:module/:fn', async (c) => {
    const { module, fn } = c.req.param();
    const functions = Object.hasOwn(registry, module) ? registry[module] : undefined;
    const target = functions && Object.hasOwn(functions, fn) ? functions[fn] : undefined;
    if (!target) throw new ApiError(404, `Unknown operation ${module}.${fn}.`);

    const needs = MODULE_SCREENS[module];
    if (needs) {
      const has = allowedScreens(c.var.auth.user);
      if (!needs.some((s) => has.includes(s))) {
        throw new ApiError(403, 'The shop owner has not given you this part of the app.');
      }
    }

    const b = await body(c);
    if (!Array.isArray(b.args)) throw badRequest('args must be an array.');
    const args: unknown[] = [...b.args];
    // JSON turned undefined into null; put it back so default parameters apply.
    if (Array.isArray(b.undef)) {
      for (const i of b.undef) {
        if (Number.isInteger(i) && i >= 0 && i < args.length) args[i] = undefined;
      }
    }

    // One shop's operations run one at a time. The services were written for a
    // single phone: the next invoice number is read and then written, stock is
    // read before it moves. Two counters billing at the same instant would
    // otherwise both be handed the same number. A shop's requests take
    // milliseconds, so the queue is never felt; other shops are not held up.
    await db.execute(sql`select pg_advisory_xact_lock(${c.var.auth.shop.id})`);

    const result = await target(...args);
    return c.json(result === undefined ? {} : { result });
  });
