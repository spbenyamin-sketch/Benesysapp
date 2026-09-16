// On web the server owns the schema (server: npm run db:migrate), so there is
// nothing to prepare in the browser.
export function useDbMigrations(): { success: boolean; error?: Error } {
  return { success: true };
}
