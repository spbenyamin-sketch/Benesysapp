// The licence, as seen from Settings once the app is already running.
//
// LicenseGate only appears when the app is locked out; this is the other half —
// how long is left, and a place to type a renewal key BEFORE the expiry lands
// rather than on the morning the shop cannot bill.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Share, Text, View } from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import { formatKey, normalizeKey } from '@/modules/license/key';
import { activate, checkLicense, WARN_DAYS, type LicenseStatus } from '@/modules/license/service';
import { formatDate } from '@/utils/format';

export default function LicenseCard() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [entering, setEntering] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let active = true;
    checkLicense().then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, []);

  // Reloading on focus also refreshes the last-run stamp on every visit.
  useFocusEffect(load);

  const send = () => {
    if (!status) return;
    void Share.share({
      message: `Billing App licence\n\nSystem ID: ${status.systemId}${
        status.expiry ? `\nExpires: ${status.expiry}` : ''
      }`,
    });
  };

  const submit = async () => {
    setBusy(true);
    const result = await activate(key);
    setBusy(false);
    if (!result.ok) {
      Alert.alert('Key not accepted', result.reason ?? 'That key is not valid for this device.');
      return;
    }
    setKey('');
    setEntering(false);
    load();
    Alert.alert('Licence updated', `Valid until ${formatDate(result.expiry!)}.`);
  };

  if (!status) return null;

  const warn = status.daysLeft !== undefined && status.daysLeft <= WARN_DAYS;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>System ID</Text>
        <Text style={styles.value} selectable>
          {status.systemId}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Licence</Text>
        <Text style={[styles.value, warn && styles.warnText]}>
          {status.expiry
            ? `${formatDate(status.expiry)}${
                status.daysLeft !== undefined
                  ? status.daysLeft < 0
                    ? ' · expired'
                    : ` · ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left`
                  : ''
              }`
            : 'Not activated'}
        </Text>
      </View>

      {warn ? (
        <Text style={styles.warnBanner}>
          Contact your vendor for a renewal key before this runs out — the app stops opening on the
          expiry date.
        </Text>
      ) : null}

      {entering ? (
        <>
          <TextField
            label="New licence key"
            value={key}
            onChangeText={(text) => setKey(formatKey(text.toUpperCase().replace(/[^0-9A-F]/g, '')))}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
          />
          <Button
            label="Apply key"
            onPress={submit}
            loading={busy}
            disabled={normalizeKey(key) === null}
          />
          <Pressable onPress={() => setEntering(false)} hitSlop={8}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.buttons}>
          <Button label="Send System ID" tone="ghost" onPress={send} style={styles.flex} />
          <Button
            label="Enter key"
            tone="ghost"
            onPress={() => setEntering(true)}
            style={styles.flex}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontSize: 13, color: '#888' },
  value: { fontSize: 14, fontWeight: '700', color: '#111', flexShrink: 1, textAlign: 'right' },
  warnText: { color: '#c0392b' },
  warnBanner: {
    fontSize: 12,
    color: '#8a5a00',
    backgroundColor: '#fff4e5',
    borderRadius: 10,
    padding: 10,
    lineHeight: 18,
  },
  buttons: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  link: { color: '#208AEF', fontSize: 13, textAlign: 'center' },
});
