// The licence, as seen from Settings once the app is already running.
//
// LicenseGate only appears when the app is locked out; this is the other half —
// how long is left, and a place to import a renewal BEFORE the expiry lands
// rather than on the morning the shop cannot bill.

import { File } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Button from '@/components/Button';
import { activateFromFile, checkLicense, WARN_DAYS, type LicenseStatus } from '@/modules/license/service';
import { formatDate } from '@/utils/format';

export default function LicenseCard() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState<string | null>(null);

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
        status.expiry ? `\n${status.trial ? 'Trial ends' : 'Expires'}: ${status.expiry}` : ''
      }`,
    });
  };

  const apply = async (text: string) => {
    setBusy(true);
    try {
      const result = await activateFromFile(text);
      if (!result.ok) {
        Alert.alert('Licence not accepted', result.reason ?? 'That licence is not valid for this phone.');
        return;
      }
      setPasted(null);
      load();
      Alert.alert('Licence updated', `Valid until ${formatDate(result.license!.expiry)}.`);
    } catch (e) {
      Alert.alert('Could not read that licence', (e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    const picked = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;

    let text: string;
    try {
      text = await new File(picked.assets[0].uri).text();
    } catch (e) {
      Alert.alert('Could not read that file', (e as Error)?.message ?? String(e));
      return;
    }
    await apply(text);
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
        <Text style={styles.label}>{status.trial ? 'Free trial' : 'Licence'}</Text>
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

      {status.client ? (
        <View style={styles.row}>
          <Text style={styles.label}>Issued to</Text>
          <Text style={styles.value}>{status.client}</Text>
        </View>
      ) : null}

      {warn ? (
        <Text style={styles.warnBanner}>
          {status.trial
            ? 'Ask your vendor for a licence before the trial ends — the app stops opening after the last day. Your data is kept.'
            : 'Ask your vendor for a renewal file before this runs out — the app stops opening on the expiry date.'}
        </Text>
      ) : null}

      {pasted !== null ? (
        <View style={styles.pasteBox}>
          <TextInput
            style={styles.paste}
            value={pasted}
            onChangeText={setPasted}
            placeholder={'Paste the renewal your vendor sent — {"app":"billing-app", …}'}
            placeholderTextColor="#aaa"
            multiline
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          <View style={styles.buttons}>
            <Button
              label="Cancel"
              tone="ghost"
              onPress={() => setPasted(null)}
              style={styles.flex}
            />
            <Button
              label="Activate"
              onPress={() => void apply(pasted)}
              disabled={!pasted.trim()}
              loading={busy}
              style={styles.flex}
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.buttons}>
            <Button label="Send System ID" tone="ghost" onPress={send} style={styles.flex} />
            <Button
              label="Paste licence"
              tone="ghost"
              onPress={() => setPasted('')}
              style={styles.flex}
            />
          </View>
          <Button
            label="Import licence file"
            tone="ghost"
            onPress={importFile}
            loading={busy}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  label: { fontSize: 13, color: '#888' },
  value: { fontSize: 14, fontWeight: '700', color: '#111', flex: 1, textAlign: 'right' },
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
  pasteBox: { gap: 10 },
  paste: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 96,
    textAlignVertical: 'top',
    fontSize: 13,
    color: '#111',
    backgroundColor: '#fff',
  },
});
