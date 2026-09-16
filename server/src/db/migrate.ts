import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { control, pool } from './client';
import { shops } from './control-schema';
import { migrateShop } from './shop-migrations';

// `npm run db:migrate`: the control tables first, then every existing shop.

async function main() {
  await migrate(control, { migrationsFolder: path.join(__dirname, '../../drizzle/control') });
  console.log('control schema up to date');

  const all = await control.select({ id: shops.id }).from(shops).orderBy(shops.id);
  for (const { id } of all) {
    const ran = await control.transaction((tx) => migrateShop(tx, id));
    console.log(`shop_${id}: ${ran.length ? ran.join(', ') : 'up to date'}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
