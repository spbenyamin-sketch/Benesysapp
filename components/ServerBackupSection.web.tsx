// Online mode's Settings → Server backup. The server copies the whole database
// into a backup every day it is on (server/src/backup/pgDump.ts); this tells the
// owner when it last did, where the copies are, and — the reason it exists —
// says so plainly when the last try failed. Staff never see it.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import { t } from '@/i18n';
import { api } from '@/web/api';
import { isOwner } from '@/web/staff';

interface BackupStatus {
  dir: string;
  latest: { file: string; at: string; size: number } | null;
  error: { at: string; message: string } | null;
}

const message = (e: unknown) => (e as Error)?.message ?? String(e);

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** More than two days without one is worth a warning even if nothing failed. */
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

export default function ServerBackupSection() {
  const owner = isOwner();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api<BackupStatus>('/api/backup', { method: 'GET' }));
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);

  const backUpNow = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api<BackupStatus>('/api/backup', { body: {} }));
    } catch (e) {
      setError(message(e));
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (!owner) return null;

  const latest = status?.latest ?? null;
  const stale = latest !== null && Date.now() - Date.parse(latest.at) > STALE_MS;

  return (
    <>
      {/* Its own divider, so staff — who see neither this nor People — get no stray line. */}
      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>{t('Server backup')}</Text>
      <Text style={styles.sectionHint}>
        {t(
          'The server copies all the books into a backup file every day it is switched on, and keeps the last 30. To put one back, double-click restore-backup.bat on the shop computer.',
        )}
      </Text>

      {status === null && !error ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <View style={styles.card}>
          {latest ? (
            <Text style={[styles.line, stale && styles.warn]}>
              {t('Last backup: {when}', { when: when(latest.at) })} ·{' '}
              {Math.max(1, Math.round(latest.size / 1024))} KB
            </Text>
          ) : (
            <Text style={[styles.line, styles.warn]}>{t('No backup has been taken yet.')}</Text>
          )}
          {status?.error ? (
            <Text style={styles.error}>
              {t('The last backup failed ({when}):', { when: when(status.error.at) })} {status.error.message}
            </Text>
          ) : null}
          {status ? <Text style={styles.meta}>{t('Saved in {dir}', { dir: status.dir })}</Text> : null}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label={t('Back up now')} tone="ghost" onPress={backUpNow} loading={busy} style={styles.save} />
    </>
  );
}

const styles = StyleSheet.create({
  // The Settings screen's own heading styles; its container supplies the gaps.
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  sectionHint: { fontSize: 12, color: '#888', marginTop: -8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginVertical: 12 },
  error: { color: '#c0392b', fontSize: 13 },
  warn: { color: '#b9770e' },
  loading: { alignSelf: 'flex-start' },
  save: { alignSelf: 'flex-start', minWidth: 200 },
  card: {
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
    gap: 6,
  },
  line: { fontSize: 15, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#888' },
});
