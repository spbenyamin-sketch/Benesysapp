// Drives the backup schedule from inside React: check on mount, on every return
// to the foreground, and on a slow heartbeat while the app stays open.
//
// The heartbeat is one minute — cheap, since `runBackupIfDue` does nothing but
// read two settings rows unless a backup is actually due.
//
// Two things ride along with each check: a retry of any backup that couldn't be
// emailed while the phone was offline, and — for the no-setup 'ask' mode — a
// one-tap offer to send the waiting backup through the phone's mail app.

import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { runBackupIfDue } from '@/modules/backup/auto';
import { copyToChosenFolder } from '@/modules/backup/destination';
import {
  clearPendingEmail,
  emailBackup,
  flushPendingEmail,
  getEmailConfig,
  getPendingEmail,
  sendPendingByComposer,
} from '@/modules/backup/email';

const HEARTBEAT_MS = 60_000;

/** Both off-phone destinations: the synced folder and the backup email. */
export const BACKUP_UPLOADERS = [copyToChosenFolder, emailBackup];

export function useAutoBackup(): void {
  // Guards against two checks overlapping (foreground event + heartbeat firing
  // together would otherwise write two snapshots).
  const running = useRef(false);
  // The "send this backup?" prompt is offered once per app session — a shop
  // phone is picked up constantly and a nag on every check would be unusable.
  const asked = useRef(false);

  useEffect(() => {
    let alive = true;

    const offerToSend = async () => {
      if (asked.current || !alive) return;
      const [config, pending] = await Promise.all([getEmailConfig(), getPendingEmail()]);
      if (config.mode !== 'ask' || !pending || !config.to || !alive) return;
      asked.current = true;
      Alert.alert(
        'Backup ready to email',
        `Send today's backup to ${config.to}? Your mail app opens with the file attached.`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Forget it',
            style: 'destructive',
            onPress: () => void clearPendingEmail(),
          },
          {
            text: 'Send',
            onPress: async () => {
              try {
                await sendPendingByComposer(pending);
              } catch (e) {
                Alert.alert('Could not open mail', (e as Error)?.message ?? String(e));
              }
            },
          },
        ],
      );
    };

    const check = async () => {
      if (running.current || !alive) return;
      running.current = true;
      try {
        await runBackupIfDue(new Date().toISOString(), BACKUP_UPLOADERS);
        // An earlier backup may still be waiting on a network.
        await flushPendingEmail(new Date().toISOString());
        await offerToSend();
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
