// How pm2 runs Online mode on the shop computer: one process, restarted if it
// crashes and started again when Windows boots (start-web.bat does the
// `pm2 save` and `pm2-startup install` that make that stick).
//
// One process, because the server also hands out the web app itself — see
// WEB_DIR in server/src/app.ts. So there is one thing running and one address
// to open, http://localhost:4747.
//
// tsx's CLI is named directly rather than going through `npm run`: on Windows
// that would put a cmd.exe between pm2 and the server, and pm2 would then be
// watching the wrapper instead of the thing that has to stay up.

const path = require('path');

const SERVER = path.join(__dirname, 'server');

module.exports = {
  apps: [
    {
      name: 'benesys-billing',
      cwd: SERVER,
      script: path.join(SERVER, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      args: ['--env-file=.env', 'src/index.ts'],
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      // A crash loop is a broken install, not something to hammer at: stop
      // after ten tries so `pm2 logs` still holds the reason.
      max_restarts: 10,
      restart_delay: 2000,
      time: true,
    },
  ],
};
