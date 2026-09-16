import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
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

/**
 * Where `expo export --platform web` put the app. Serving it from this same
 * process is what makes the shop computer one thing to start and one address to
 * open — no second server, no second port, and no cross-origin call at all.
 * Relative, because that is what serveStatic takes; resolved once to check it.
 */
const WEB_DIR = process.env.WEB_DIR ?? '../dist';

export function createApp() {
  const hasWebBuild = existsSync(path.resolve(process.cwd(), WEB_DIR, 'index.html'));
  // The web app is served from its own origin (Expo's dev server is :8081), so
  // the browser has to be told it may call this one. Auth is a bearer header,
  // not a cookie, so there is no cross-site request to forge — which is also
  // why CORS_ORIGINS=* (any device on the shop's network) is acceptable.
  const configured = (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = configured.includes('*') ? (o: string) => o : configured;

  const app = new Hono<AppEnv>()
    .use('/api/*', cors({ origin, allowHeaders: ['Authorization', 'Content-Type'] }))
    .get('/api/health', (c) => c.json({ ok: true }))
    .route('/api/auth', authRoutes)
    .route('/api/users', userRoutes)
    .route('/api/rpc', rpcRoutes);

  if (hasWebBuild) {
    // The files the export produced, then index.html for everything else: the
    // app routes on its own, so /invoice/12 typed into the address bar has to
    // reach the same page rather than a 404 from this server.
    app.use('/*', serveStatic({ root: WEB_DIR })).get(
      '*',
      serveStatic({ root: WEB_DIR, rewriteRequestPath: () => '/index.html' }),
    );
  }

  return app
    .notFound((c) =>
      c.req.path.startsWith('/api/') || hasWebBuild
        ? c.json({ error: 'Not found.' }, 404)
        : c.text(
            'The web app has not been built yet. Run start-web.bat, or `npx expo export --platform web` in the project folder.',
            404,
          ),
    )
    .onError((err, c) => {
      if (err instanceof ApiError) return c.json({ error: err.message }, err.status);
      if (isUserFacing(err)) return c.json({ error: err.message }, 400);
      console.error(err);
      return c.json({ error: 'Something went wrong on the server.' }, 500);
    });
}
