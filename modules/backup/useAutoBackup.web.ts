// Online mode: the shop's books live in the server's database, so there are no
// local snapshots to schedule and no Drive upload (whose OAuth needs the app's
// own package scheme anyway). Same exports as useAutoBackup.ts.

export const BACKUP_UPLOADERS: never[] = [];

export function useAutoBackup(): void {}
