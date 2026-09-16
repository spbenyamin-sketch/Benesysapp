import { defineConfig } from 'drizzle-kit';

// Shops, users, sessions — the `public` schema. Applied once per database.
export default defineConfig({
  schema: './src/db/control-schema.ts',
  out: './drizzle/control',
  dialect: 'postgresql',
});
