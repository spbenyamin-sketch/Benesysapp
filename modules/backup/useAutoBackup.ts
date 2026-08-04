// Drives the backup schedule from inside React: check on mount, on every return
// to the foreground, and on a slow heartbeat while the app stays open.
//
// The heartbeat is one minute — cheap, since `runBackupIfDue` does nothing but
// read two settings rows unless a backup is actually due.
//
// Every run writes a snapshot on the phone first and then, if a Google account
// is connected, uploads it to that account's Drive.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { runBackupIfDue } from '@/modules/backup/auto';
import { uploadToDrive } from '@/modules/backup/drive';

const HEARTBEAT_MS = 60_000;

/** The off-phone destination. Local snapshots always happen regardless. */
export const BACKUP_UPLOADERS = [uploadToDrive];

export function useAutoBackup(): void {
  // Guards against two checks overlapping (foreground event + heartbeat firing
  // together would otherwise write two snapshots).
  const running = useRef(false);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      if (running.current || !alive) return;
      running.current = true;
      try {
        await runBackupIfDue(new Date().toISOString(), BACKUP_UPLOADERS);
      } catch {
        /* a failed backup must never crash the app */
      } finally {
        running.current = false;
      }
    };

    void check();
    const timer = setInterval(check, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
