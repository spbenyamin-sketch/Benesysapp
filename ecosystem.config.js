// How pm2 runs Online mode on the shop computer: one process, restarted if it
// crashes and started again when Windows boots (start-web.bat does the
// `pm2 save` and `pm2-startup install` that make that stick).
//
// One process, because the server also hands out the web app itself — see
// WEB_DIR in server/src/app.ts. So there is one thing running and one address
// to open, http://localhost:4747.
//
// node loads tsx and the .ts entry point itself, rather than pm2 running tsx's
// CLI or `npm run`. Either of those puts a second process in the middle — and
// on Windows that middle process gets its own console window on the desktop,
// which pm2 then faithfully brings back every time somebody closes it. One
// process: pm2 watches the server itself, and there is nothing to see.

const path = require('path');

const SERVER = path.join(__dirname, 'server');

module.exports = {
  apps: [
    {
      name: 'benesys-billing',
      cwd: SERVER,
      script: path.join(SERVER, 'src', 'index.ts'),
      interpreter: 'node',
      interpreter_args: '--import tsx --env-file=.env',
      env: { NODE_ENV: 'production' },
      // Without this the server gets its own console window on the desktop, and
      // closing it only kills the server — which pm2 dutifully starts again,
      // window and all. It is a service; it should not be a window at all.
      windowsHide: true,
      autorestart: true,
      // A crash loop is a broken install, not something to hammer at: stop
      // after ten tries so `pm2 logs` still holds the reason.
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
  ],
};
