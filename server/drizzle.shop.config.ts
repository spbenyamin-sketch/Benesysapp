import { defineConfig } from 'drizzle-kit';

// One shop's books. These migrations are applied to EVERY shop_<id> schema by
// src/db/shop-migrations.ts — never by drizzle-kit's own migrate command, which
// would only ever touch `public`.
export default defineConfig({
  schema: './src/db/shop-schema.ts',
  out: './drizzle/shop',
  dialect: 'postgresql',
});
