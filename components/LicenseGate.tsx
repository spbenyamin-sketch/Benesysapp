// Device-locked activation, outside everything else.
//
// Like AuthGate this is a GATE, not a route: while it shows, the navigator and
// the login screen underneath are not mounted, so an unlicensed install has
// nothing to reach. It sits OUTSIDE AuthGate — an expired licence should stop
// the app before it asks for a password, not after.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import { getSystemId } from '@/modules/license/device';
import { formatKey, normalizeKey } from '@/modules/license/key';
import { activate, checkLicense, isUsable, type LicenseStatus } from '@/modules/license/service';

const VENDOR = 'BeneSys';

export default function LicenseGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await checkLicense());
    } catch {
      // A Keystore read that fails leaves us with no way to prove the licence.
      // Falling back to the activation screen keeps the app usable — the client
      // re-enters the key they already have — instead of spinning forever.
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
    blurb: `Send the System ID below to ${VENDOR} and enter the key you get back. This only has to be done once on this phone.`,
  },
  expired: {
    icon: '⏳',
    title: 'Licence expired',
    blurb: `Your licence has run out. Send the System ID to ${VENDOR} for a renewal key — your shop data is untouched and comes straight back.`,
  },
  rolledBack: {
    icon: '⚠️',
    title: "Phone's date was changed",
    blurb:
      'The date on this phone is earlier than the last time the app ran. Set the date back to today and reopen the app, or enter a fresh key.',
  },
};

function ActivationScreen({
  status,
  onActivated,
}: {
  status: LicenseStatus;
  onActivated: () => void;
}) {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const heading = HEADINGS[status.state] ?? HEADINGS.unlicensed;
  const ready = normalizeKey(key) !== null;

  const send = () => {
    void Share.share({
      message:
        `Billing App activation\n\nSystem ID: ${status.systemId}` +
        (status.expiry ? `\nExpired on: ${status.expiry}` : ''),
    });
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const result = await activate(key);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason ?? 'That key was not accepted.');
      return;
    }
    onActivated();
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

        <TextField
          label="Activation key"
          value={key}
          onChangeText={(text) => setKey(formatKey(text.toUpperCase().replace(/[^0-9A-F]/g, '')))}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          autoCapitalize="characters"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label="Activate"
          onPress={submit}
          loading={busy}
          disabled={!ready}
          style={styles.wide}
        />

        <Pressable onPress={send} hitSlop={8}>
          <Text style={styles.help}>No key yet? Tap “Send System ID” and contact {VENDOR}.</Text>
        </Pressable>
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
  wide: { alignSelf: 'stretch' },
  help: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
