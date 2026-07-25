import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './client';
import migrations from './migrations/migrations';

/**
 * Runs any pending SQL migrations against the local SQLite DB on app start.
 * Returns { success, error } — the app should wait for `success` before reading data.
 */
export function useDbMigrations() {
  return useMigrations(db, migrations);
}
