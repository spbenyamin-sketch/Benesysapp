import type { db as nativeDb } from './client';

// On web there is no local database: the shop's books are on the server, and
// every service function that would have queried this is replaced by a network
// call (metro.config.js → web/services). This file exists so the real service
// modules can still be bundled for their synchronous helpers without dragging
// expo-sqlite into the browser. Reaching it means a query escaped that swap.

function unavailable(): never {
  throw new Error('No local database on web — this call should have gone to the server.');
}

export const db = new Proxy({}, { get: unavailable }) as typeof nativeDb;
export const sqlite = null;
