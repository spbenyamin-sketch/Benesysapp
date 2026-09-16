import { serve } from '@hono/node-server';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 4747);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`Benesys server on http://localhost:${info.port}`);
});
