// Device-locked activation, outside everything else.
//
// Like AuthGate this is a GATE, not a route: while it shows, the navigator and
// the login screen underneath are not mounted, so an unlicensed install has
// nothing to reach. It sits OUTSIDE AuthGate — an expired licence should stop
// the app before it asks for a password, not after.

import { File } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from '@/components/Button';
import { getSystemId } from '@/modules/license/device';
import { activateFromFile, checkLicense, isUsable, type LicenseStatus } from '@/modules/license/service';

const VENDOR = 'BeneSys';

export default function LicenseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await checkLicense());
    } catch {
      // A Keystore read that fails leaves us with no way to prove the licence.
      // Falling back to the activation screen keeps the app usable — the client
      // re-imports the file they already have — instead of spinning forever.
      setStatus({ state: 'unlicensed', systemId: await getSystemId().catch(() => '—') });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isUsable(status)) return <>{children}</>;

  return <ActivationScreen status={status} onActivated={refresh} />;
}

const HEADINGS: Record<string, { icon: string; title: string; blurb: string }> = {
  unlicensed: {
    icon: '🔑',
    title: 'Activate Billing App',
    blurb: `Send the System ID below to ${VENDOR}. You'll get a licence back — paste it in the box below and tap Activate.`,
  },
  expired: {
    icon: '⏳',
    title: 'Licence expired',
    blurb: `Your licence has run out. Send the System ID to ${VENDOR} for a renewal, then paste it below — your shop data is untouched and comes straight back.`,
  },
  trialOver: {
    icon: '⏳',
    title: 'Free trial over',
    blurb: `Your 7-day free trial has ended. Send the System ID below to ${VENDOR} for a licence, then paste it below — everything you entered during the trial is kept.`,
  },
  rolledBack: {
    icon: '⚠️',
    title: "Phone's date was changed",
    blurb:
      'The date on this phone is earlier than the last time the app ran. Set the date back to today and reopen the app.',
  },
};

function ActivationScreen({
  status,
  onActivated,
}: {
  status: LicenseStatus;
  onActivated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');

  const key = status.state === 'expired' && status.trial ? 'trialOver' : status.state;
  const heading = HEADINGS[key] ?? HEADINGS.unlicensed;

  const send = () => {
    void Share.share({
      message:
        `Billing App activation\n\nSystem ID: ${status.systemId}` +
        (status.expiry ? `\n${status.trial ? 'Trial ended' : 'Expired'} on: ${status.expiry}` : ''),
    });
  };

  const apply = async (text: string) => {
    setBusy(true);
    try {
      const result = await activateFromFile(text);
      if (!result.ok) {
        setError(result.reason ?? 'That licence was not accepted.');
        return;
      }
      onActivated();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const activatePasted = () => {
    setError(null);
    void apply(pasted);
  };

  const importFile = async () => {
    setError(null);
    // The licence arrives over WhatsApp, and Android hands those files out with
    // whatever MIME type it feels like — '*/*' is the only filter that reliably
    // shows a .lic at all.
    const picked = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;

    let text: string;
    try {
      text = await new File(picked.assets[0].uri).text();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
      return;
    }
    await apply(text);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>{heading.icon}</Text>
        <Text style={styles.title}>{heading.title}</Text>
        <Text style={styles.subtle}>{heading.blurb}</Text>

        <View style={styles.idBox}>
          <Text style={styles.idLabel}>System ID</Text>
          <Text style={styles.idValue} selectable>
            {status.systemId}
          </Text>
        </View>

        <Button label="Send System ID" tone="ghost" onPress={send} style={styles.wide} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.pasteBox}>
          <Text style={styles.pasteLabel}>Paste the licence {VENDOR} sent you</Text>
          <TextInput
            style={styles.paste}
            value={pasted}
            onChangeText={setPasted}
            placeholder={'{"app":"billing-app", …}'}
            placeholderTextColor="#aaa"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          <Text style={styles.pasteHelp}>
            Hold on the message in WhatsApp → Copy, then hold in the box above → Paste.
          </Text>
        </View>

        <Button
          label="Activate"
          onPress={activatePasted}
          disabled={!pasted.trim()}
          loading={busy}
          style={styles.wide}
        />

        <Button
          label="Import licence file instead"
          tone="ghost"
          onPress={importFile}
          style={styles.wide}
        />

        <Text style={styles.help}>
          If {VENDOR} sent a file rather than a message, save it to Downloads first, then tap
          Import.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  form: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  brand: { fontSize: 44, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center' },
  subtle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 19 },
  idBox: {
    backgroundColor: '#f2f6fb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8e6f5',
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  idLabel: { fontSize: 12, color: '#6b7c8d', fontWeight: '600' },
  idValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  error: { color: '#c0392b', fontSize: 13, textAlign: 'center' },
  pasteBox: { gap: 6 },
  pasteLabel: { fontSize: 13, fontWeight: '600', color: '#444' },
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
  pasteHelp: { color: '#888', fontSize: 12, lineHeight: 17 },
  wide: { alignSelf: 'stretch' },
  help: { color: '#888', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
