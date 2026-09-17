// Online mode's licence gate: this INSTALLATION is licensed, not the browser.
//
// The phone's licence is bound to the handset, so its gate sits outside AuthGate
// — an expired install stops before it asks for a password. Here it is the other
// way round, and on purpose: what the licence names is the server, only the shop
// owner may install one (POST /api/license is owner-only), and a paste box shown
// to an anonymous browser could not be honoured. So the browser signs in first,
// and this gate then blocks everything that account would have reached.
//
// Nothing is exposed by that order, because the browser is not what enforces it.
// `requireLicense` on the server refuses every /api/rpc and /api/users call
// while the install is unlicensed, so an unlicensed server has no data to give a
// signed-in person, a patched bundle, or curl. This screen is the part that
// explains what to do about it.
//
// Not signed in — or the server unreachable — and it simply steps aside: AuthGate
// underneath owns those two screens, and the server is still refusing the data.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from '@/components/Button';
import { signOut } from '@/modules/auth/service.web';
import { isUsable, type LicenseStatus } from '@/modules/license/status';
import { getLicenseStatus, installLicense } from '@/web/license';
import { getSession, onSessionChange, type WebSession } from '@/web/session';

const VENDOR = 'BeneSys';

type Phase = 'pass' | 'checking' | 'blocked';

export default function LicenseGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WebSession | null>(getSession());
  const [phase, setPhase] = useState<Phase>(session ? 'checking' : 'pass');
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  // The token this gate has already asked about. Every page load refreshes the
  // session against /api/auth/me, which hands back the same token and tells the
  // listeners about it; asking the licence again on that would put the spinner
  // back up, unmount AuthGate underneath, and have it refresh once more — a
  // loop the shop sees as a page that never finishes loading. Only a different
  // token — a sign-in, a sign-out, another account — is worth a fresh answer.
  const asked = useRef<string | null>(session?.token ?? null);

  useEffect(
    () =>
      onSessionChange((s) => {
        setSession(s);
        const token = s?.token ?? null;
        if (token === asked.current) return;
        asked.current = token;
        setPhase(s ? 'checking' : 'pass');
      }),
    [],
  );

  useEffect(() => {
    if (phase !== 'checking') return;
    let live = true;
    getLicenseStatus()
      .then((s) => {
        if (!live) return;
        setStatus(s);
        setPhase(isUsable(s) ? 'pass' : 'blocked');
      })
      // A stale token or an unreachable server: let AuthGate say so in its own
      // words. The server has not stopped refusing anything by us stepping back.
      .catch(() => live && setPhase('pass'));
    return () => {
      live = false;
    };
  }, [phase]);

  if (phase === 'pass') return <>{children}</>;

  if (phase === 'checking' || !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <LicenseScreen
      status={status}
      owner={session?.user.role === 'owner'}
      onInstalled={(next) => {
        setStatus(next);
        setPhase(isUsable(next) ? 'pass' : 'blocked');
      }}
      onRecheck={() => setPhase('checking')}
    />
  );
}

const HEADINGS: Record<string, { title: string; blurb: (status: LicenseStatus) => string }> = {
  unlicensed: {
    title: 'Activate this shop',
    blurb: () =>
      `Send the Server ID below to ${VENDOR}. You'll get a licence back over WhatsApp — paste it here and the shop opens.`,
  },
  expired: {
    title: 'Licence expired',
    blurb: (s) =>
      `This shop's licence ran out on ${s.expiry}. Send the Server ID to ${VENDOR} for a renewal, then paste it here — your books are untouched and come straight back.`,
  },
  rolledBack: {
    title: "This computer's date was changed",
    blurb: () =>
      'The date on this computer is earlier than the last time the shop was opened. Set it back to today, then try again.',
  },
};

/**
 * Pick a `.lic` off the shop computer. The licence usually arrives as a WhatsApp
 * message that is quicker to paste, so this is the second offer, not the first.
 * A cancelled picker never fires `change`; nothing is waiting on it.
 */
function pickLicenseFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lic,application/json,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

function LicenseScreen({
  status,
  owner,
  onInstalled,
  onRecheck,
}: {
  status: LicenseStatus;
  owner: boolean;
  onInstalled: (next: LicenseStatus) => void;
  onRecheck: () => void;
}) {
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const heading = HEADINGS[status.state] ?? HEADINGS.unlicensed;
  // Over plain http to another device on the shop's network the browser withholds
  // the clipboard. The ID is selectable either way, so the button just goes.
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(status.systemId);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the Server ID above and copy it by hand.');
    }
  };

  const apply = async (text: string) => {
    setError(null);
    setBusy(true);
    try {
      onInstalled(await installLicense(text));
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    setError(null);
    const text = await pickLicenseFile();
    if (text === null) return;
    await apply(text);
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Image source={require('@/assets/images/icon.png')} style={styles.brand} />
        <Text style={styles.title}>{heading.title}</Text>
        <Text style={styles.subtle}>{heading.blurb(status)}</Text>

        <View style={styles.idBox}>
          <Text style={styles.idLabel}>Server ID</Text>
          <Text style={styles.idValue} selectable>
            {status.systemId}
          </Text>
        </View>

        {canCopy ? (
          <Button
            label={copied ? 'Copied' : 'Copy Server ID'}
            tone="ghost"
            onPress={() => void copy()}
            style={styles.wide}
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {status.state === 'rolledBack' ? (
          <Button label="Try again" onPress={onRecheck} style={styles.wide} />
        ) : owner ? (
          <>
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
            </View>

            <Button
              label="Activate"
              onPress={() => void apply(pasted)}
              disabled={!pasted.trim()}
              loading={busy}
              style={styles.wide}
            />
            <Button
              label="Choose a licence file instead"
              tone="ghost"
              onPress={() => void importFile()}
              style={styles.wide}
            />
          </>
        ) : (
          // Staff can see what is wrong and who has to fix it, and get out of the
          // way — otherwise the owner cannot reach the sign-in form to do it.
          <Text style={styles.subtle}>
            Only the shop owner can install the licence. Sign out and let them sign in on this
            computer.
          </Text>
        )}

        <Pressable onPress={() => void signOut()} hitSlop={8}>
          <Text style={styles.switch}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// Deliberately the same card, colours and type as AuthGate.web.tsx — to the shop
// this is the same kind of door, one step further out.
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f4f5f7' },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  form: { padding: 24, flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  brand: { width: 76, height: 76, alignSelf: 'center', resizeMode: 'contain' },
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
    fontSize: 18,
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
  wide: { alignSelf: 'stretch' },
  switch: { color: '#208AEF', fontSize: 14, textAlign: 'center', fontWeight: '600', marginTop: 4 },
});
