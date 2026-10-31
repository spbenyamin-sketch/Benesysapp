// Put the shop's books back from one of the server's daily backups.
// restore-backup.bat runs this on the shop computer, with the server stopped.
//
// Everything in the database is replaced by what the backup holds — every bill,
// party, item, account and sign-in made since it was taken is gone. So before
// touching anything it takes one more backup of the books as they are now: a
// restore of the wrong day can itself be undone by restoring that.
//
// pg_restore runs as one transaction. If it fails partway, nothing changes.

import { createInterface } from 'node:readline/promises';
import { backupDir, listBackups, pgEnv, runPgTool, takeBackup, type BackupFile } from '../backup/pgDump';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Which backup, and a typed YES. Null if the person backed out. */
async function choose(backups: BackupFile[]): Promise<BackupFile | null> {
  const rl = createInterface({ input: process.stdin });
  // Lines read in turn rather than rl.question(), which drops the second answer
  // when they arrive together (pasted, or piped in).
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q: string) => {
    process.stdout.write(q);
    return ((await lines.next()).value ?? '').trim();
  };
  try {
    const pick = (await ask('\nWhich one? Type its number (Enter = 1, the newest): ')) || '1';
    const chosen = /^\d+$/.test(pick) ? backups[Number(pick) - 1] : undefined;
    if (!chosen) {
      console.log('\nNo such number.');
      return null;
    }
    console.log(`\nThis puts the books back to ${when(chosen.at)}.`);
    console.log('Everything entered after that - bills, payments, parties, staff - will be gone.');
    if ((await ask('Type YES to go ahead: ')) !== 'YES') {
      console.log('\nCancelled.');
      return null;
    }
    return chosen;
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const backups = (await listBackups()).slice(0, 15);
  if (!backups.length) {
    console.log(`\nNo backups found in ${backupDir()}\n`);
    return 1;
  }

  console.log(`\nBackups in ${backupDir()}:\n`);
  backups.forEach((b, i) =>
    console.log(`  ${String(i + 1).padStart(2)}.  ${when(b.at).padEnd(24)} ${Math.round(b.size / 1024)} KB   ${b.file}`),
  );

  const chosen = await choose(backups);
  if (!chosen) return 1;

  console.log('\nFirst, a backup of the books as they are now...');
  const safety = await takeBackup('before-restore');
  console.log(`  saved as ${safety.file}`);

  console.log(`\nRestoring ${chosen.file}...`);
  await runPgTool('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--single-transaction',
    '--exit-on-error',
    '--dbname',
    pgEnv().PGDATABASE!,
    chosen.path,
  ]);
  console.log(`\nDone. The books are back to ${when(chosen.at)}.`);
  console.log(`If that was the wrong day, run this again and pick ${safety.file}.\n`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\nNothing was changed: ${(err as Error).message}\n`);
    process.exit(1);
  });
