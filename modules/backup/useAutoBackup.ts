// Drives the backup schedule from inside React: check on mount, on every return
// to the foreground, and on a slow heartbeat while the app stays open.
//
// The heartbeat is one minute — cheap, since `runBackupIfDue` does nothing but
// read two settings rows unless a backup is actually due.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { runBackupIfDue } from '@/modules/backup/auto';
import { copyToChosenFolder } from '@/modules/backup/destination';

const HEARTBEAT_MS = 60_000;

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
        await runBackupIfDue(new Date().toISOString(), copyToChosenFolder);
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
