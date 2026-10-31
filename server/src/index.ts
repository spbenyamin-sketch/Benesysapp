import { serve } from '@hono/node-server';
import { createApp } from './app';
import { backupDir, startDailyBackups } from './backup/pgDump';

const port = Number(process.env.PORT ?? 4747);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`Benesys server on http://localhost:${info.port}`);
  console.log(`Daily database backups go to ${backupDir()}`);
  startDailyBackups();
});
