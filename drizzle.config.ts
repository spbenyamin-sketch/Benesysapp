import type { Config } from 'drizzle-kit';

// drizzle-kit reads this to generate SQL migrations from db/schema.ts.
// Tables are defined in Phase 1; run `npx drizzle-kit generate` after that.
export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
