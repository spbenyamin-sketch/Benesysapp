// Pick which Drive backup to restore. Used from Settings and from the sign-in
// screen on a fresh install — the "you have a backup, want it back?" moment.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Button from '@/components/Button';
import {
  connectDrive,
  getDriveStatus,
  listDriveBackups,
  restoreFromDrive,
  type DriveBackup,
} from '@/modules/backup/drive';
import type { RestoreCounts } from '@/modules/backup/service';

function sizeLabel(bytes: number): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DriveRestorePicker({
  visible,
  onClose,
  onRestored,
}: {
  visible: boolean;
  onClose: () => void;
  onRestored?: (counts: RestoreCounts) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [backups, setBackups] = useState<DriveBackup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getDriveStatus();
      setConnected(status.connected);
      setBackups(status.connected ? await listDriveBackups() : []);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) void load();
  }, [visible]);

  const connect = async () => {
    setBusy(true);
    try {
      const email = await connectDrive();
      if (email) await load();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = (backup: DriveBackup) => {
    Alert.alert(
      'Restore this backup?',
      `Everything currently in the app will be DELETED and replaced with "${backup.name}" from ${new Date(backup.createdTime).toLocaleString()}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const counts = await restoreFromDrive(backup.id);
              onRestored?.(counts);
              onClose();
              Alert.alert(
                'Restored from Drive',
                `${counts.parties} parties, ${counts.items} items, ${counts.invoices} invoices, ${counts.payments} payments loaded.`,
              );
            } catch (e) {
              Alert.alert('Restore failed', (e as Error)?.message ?? String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Restore from Google Drive</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {loading || busy ? (
            <ActivityIndicator style={styles.pad} />
          ) : error ? (
            <View style={styles.pad}>
              <Text style={styles.error}>{error}</Text>
              <Button label="Try again" tone="ghost" onPress={load} />
            </View>
          ) : !connected ? (
            <View style={styles.pad}>
              <Text style={styles.hint}>
                Sign in with the Google account you backed up to, and your data comes back.
              </Text>
              <Button label="Sign in with Google" onPress={connect} />
            </View>
          ) : (
            <FlatList
              data={backups}
              keyExtractor={(b) => b.id}
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.hint}>
                  No backups in this Google account yet. If you used a different account, close this
                  and connect that one.
                </Text>
              }
              renderItem={({ item, index }) => (
                <Pressable style={styles.row} onPress={() => restore(item)}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowTitle}>
                      {new Date(item.createdTime).toLocaleString()}
                      {index === 0 ? '  · newest' : ''}
                    </Text>
                    <Text style={styles.rowSub}>
                      {item.name}
                      {item.size ? ` · ${sizeLabel(item.size)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },
  close: { fontSize: 20, color: '#888' },
  pad: { padding: 20, gap: 14 },
  hint: { fontSize: 14, color: '#666', lineHeight: 20, padding: 16 },
  error: { fontSize: 14, color: '#c0392b', lineHeight: 20 },
  list: { paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  rowLeft: { flexShrink: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 12, color: '#888' },
  chevron: { fontSize: 22, color: '#ccc' },
});
