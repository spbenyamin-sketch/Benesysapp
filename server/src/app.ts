import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError } from './http/errors';
import type { AppEnv } from './http/middleware';
import { authRoutes } from './routes/auth';
import { rpcRoutes } from './routes/rpc';
import { userRoutes } from './routes/users';

/**
 * The app's services throw plain `Error`s whose messages are written for the
 * person at the counter ("That document no longer exists."). Those are shown.
 * Anything else — a database error, a TypeError — is a fault, and its message
 * may carry SQL or internals, so it is logged and replaced.
 */
function isUserFacing(err: Error): boolean {
  return Object.getPrototypeOf(err) === Error.prototype;
}

export function createApp() {
  // The web app is served from its own origin (Expo's dev server is :8081), so
  // the browser has to be told it may call this one. Auth is a bearer header,
  // not a cookie, so there is no cross-site request to forge — which is also
  // why CORS_ORIGINS=* (any device on the shop's network) is acceptable.
  const configured = (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = configured.includes('*') ? (o: string) => o : configured;

  return new Hono<AppEnv>()
    .use('/api/*', cors({ origin, allowHeaders: ['Authorization', 'Content-Type'] }))
    .get('/api/health', (c) => c.json({ ok: true }))
    .route('/api/auth', authRoutes)
    .route('/api/users', userRoutes)
    .route('/api/rpc', rpcRoutes)
    .notFound((c) => c.json({ error: 'Not found.' }, 404))
    .onError((err, c) => {
      if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
      if (isUserFacing(err)) return c.json({ error: err.message }, 400);
      console.error(err);
      return c.json({ error: 'Something went wrong on the server.' }, 500);
    });
}
