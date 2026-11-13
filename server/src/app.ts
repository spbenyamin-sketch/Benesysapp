import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError } from './http/errors';
import type { AppEnv } from './http/middleware';
import { authRoutes } from './routes/auth';
import { backupRoutes } from './routes/backup';
import { licenseRoutes } from './routes/license';
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
 * Relative, because that is what serveStatic takes.
 */
const WEB_DIR = process.env.WEB_DIR ?? '../dist';
const WEB_INDEX = path.resolve(process.cwd(), WEB_DIR, 'index.html');

/**
 * Asked per request, not once at startup. A server that happened to come up
 * before the export finished would otherwise answer 404 for the app for as long
 * as it ran, with a perfectly good build sitting on disk next to it.
 */
const hasWebBuild = () => existsSync(WEB_INDEX);

/** Expo's development server, the one other origin the web app is ever served from. */
const DEV_PORT = '8081';

/**
 * Which page origins may call this API from another origin. Normally none needs
 * to: the shop opens the app from this server itself — http://localhost:4747 at
 * the counter, http://<this PC's LAN IP>:4747 on the others — and a page calling
 * its own origin is not a CORS request at all, so LAN access needs nothing here.
 *
 * Cross-origin is only development: `npx expo start --web` serves the page on
 * :8081 and it calls the API on :4747. Allowed are localhost / 127.0.0.1 on
 * :8081, and :8081 on the same host name the request came in on (a second PC in
 * the shop opening the dev server by its LAN IP). Anything listed in
 * CORS_ORIGINS (comma-separated) is allowed as well; `*` is ignored — older
 * installs wrote CORS_ORIGINS=* and that must not mean "any web page on the
 * internet may drive this API from a browser on the shop's network".
 */
export function allowedOrigin(origin: string, requestHost: string | undefined): boolean {
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '*');
  if (extra.includes(origin)) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' || url.port !== DEV_PORT) return false;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  // The Host header's name without its port; [::1]-style hosts keep their brackets,
  // which is also how URL reports them.
  const host = (requestHost ?? '').replace(/:\d+$/, '').toLowerCase();
  return host !== '' && url.hostname === host;
}

export function createApp() {
  const app = new Hono<AppEnv>()
    .use(
      '/api/*',
      cors({
        // null sends no Access-Control-Allow-Origin, and the browser refuses the
        // cross-origin call. Same-origin calls never look at it.
        origin: (o, c) => (allowedOrigin(o, c.req.header('host')) ? o : null),
        allowHeaders: ['Authorization', 'Content-Type'],
      }),
    )
    .get('/api/health', (c) => c.json({ ok: true }))
    .route('/api/auth', authRoutes)
    .route('/api/backup', backupRoutes)
    .route('/api/license', licenseRoutes)
    .route('/api/users', userRoutes)
    .route('/api/rpc', rpcRoutes);

  // The files the export produced, then index.html for everything else: the app
  // routes on its own, so /invoice/12 typed into the address bar has to reach
  // the same page rather than a 404 from this server.
  const indexFallback = serveStatic({ root: WEB_DIR, rewriteRequestPath: () => '/index.html' });

  app
    .use('/*', serveStatic({ root: WEB_DIR }))
    .get('*', (c, next) => (hasWebBuild() ? indexFallback(c, next) : next()));

  return app
    .notFound((c) =>
      c.req.path.startsWith('/api/') || hasWebBuild()
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
