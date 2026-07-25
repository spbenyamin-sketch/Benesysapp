import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// Single shared SQLite connection for the whole app.
// enableChangeListener lets live-query hooks (drizzle's useLiveQuery) react to writes.
export const sqlite = openDatabaseSync('billing.db', { enableChangeListener: true });

// SQLite ships with FK enforcement OFF; we rely on it (e.g. invoice_items cascade).
sqlite.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
