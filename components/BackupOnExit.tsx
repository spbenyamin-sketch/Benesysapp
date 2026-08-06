// "Back up before you close?" — the last-chance backup.
//
// A shop phone gets closed at the end of the day and may not be opened again
// until the next morning, so the scheduled backup in useAutoBackup can sit
// undone for hours. Closing the app is the one moment the user is certainly
// present and certainly finished, which makes it the best time to ask.
//
// Android only: this hangs off the hardware back button, which is what actually
// closes an app there. iOS has no equivalent — a swiped-away app gets no chance
// to ask anything — so the hook simply does nothing.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getAutoBackupConfig, runBackupNow } from '@/modules/backup/auto';
import { BACKUP_UPLOADERS } from '@/modules/backup/useAutoBackup';

export default function BackupOnExit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // The back handler has to answer synchronously, but the setting lives in the
  // database. This ref carries the last known value; ask() re-reads it before
  // doing anything, so a stale "on" costs one dialog-free exit, never a wrong one.
  const enabled = useRef(true);
  // Stops a second back press from stacking another dialog on the first.
  const asking = useRef(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const config = await getAutoBackupConfig();
        if (alive) enabled.current = config.onExit;
      } catch {
        /* keep whatever we had */
      }
    };
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const exit = () => {
      asking.current = false;
      BackHandler.exitApp();
    };

    const finishOrStay = (title: string, message: string) => {
      setBusy(false);
      Alert.alert(title, message, [
        { text: 'Stay in the app', style: 'cancel', onPress: () => (asking.current = false) },
        { text: 'Close anyway', style: 'destructive', onPress: exit },
      ]);
    };

    const backupThenExit = async () => {
      setBusy(true);
      try {
        const result = await runBackupNow(new Date().toISOString(), BACKUP_UPLOADERS);
        // runBackupNow never throws for a destination that failed — the phone
        // snapshot succeeded and it reports the rest in the message. Closing on
        // a failed upload without saying so is how a backup silently stops
        // existing, so it is surfaced here.
        if (result.message.includes('failed:')) {
          finishOrStay('Backed up on the phone only', result.message);
          return;
        }
        setBusy(false);
        exit();
      } catch (e) {
        finishOrStay('Backup failed', (e as Error)?.message ?? String(e));
      }
    };

    const ask = async () => {
      let onExit = enabled.current;
      try {
        onExit = (await getAutoBackupConfig()).onExit;
        enabled.current = onExit;
      } catch {
        /* fall back to the cached value */
      }
      if (!onExit) {
        exit();
        return;
      }
      Alert.alert(
        'Close Billing App?',
        'Do you want to back up everything before closing?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => (asking.current = false) },
          { text: 'Close', style: 'destructive', onPress: exit },
          { text: 'Back up & close', onPress: () => void backupThenExit() },
        ],
        { cancelable: true, onDismiss: () => (asking.current = false) },
      );
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Somewhere to go back to — another screen, or a tab that isn't the first
      // one — means this press is navigation, not an exit. Leave it alone.
      if (router.canGoBack()) return false;
      if (asking.current || busy) return true;
      asking.current = true;
      void ask();
      return true;
    });

    return () => sub.remove();
  }, [router, busy]);

  return (
    <Modal visible={busy} transparent statusBarTranslucent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" />
          <Text style={styles.text}>Backing up before closing…</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 14,
  },
  text: { fontSize: 16, color: '#222', fontWeight: '600' },
});
