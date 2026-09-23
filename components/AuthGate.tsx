// Everything behind a local account + (optionally) the phone's own lock.
//
// This is a GATE, not a route: while it is showing, the navigator underneath is
// not mounted at all, so no screen — and no data — can be reached or screenshot
// by a back gesture. It also means no new route files, so `expo-router`'s typed
// routes don't need regenerating.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import {
  getAccount,
  isRegistered,
  isSignedIn,
  resetPasswordWithDeviceLock,
  signIn,
  signUp,
  type Account,
} from '@/modules/auth/service';
import { isLockEnabled, promptUnlock } from '@/modules/auth/lock';
import DriveRestorePicker from '@/modules/backup/DriveRestorePicker';

type Phase = 'loading' | 'signup' | 'login' | 'locked' | 'ready';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [account, setAccount] = useState<Account | null>(null);
  // Read by the AppState listener, which is registered once and would otherwise
  // capture the phase from first render forever.
  const phaseRef = useRef<Phase>('loading');
  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const registered = await isRegistered();
      if (!active) return;
      if (!registered) {
        setPhaseBoth('signup');
        return;
      }
      const [signed, locked, acc] = await Promise.all([
        isSignedIn(),
        isLockEnabled(),
        getAccount(),
      ]);
      if (!active) return;
      setAccount(acc);
      if (!signed) setPhaseBoth('login');
      else setPhaseBoth(locked ? 'locked' : 'ready');
    })();
    return () => {
      active = false;
    };
  }, [setPhaseBoth]);

  // Re-lock when the app comes back from the background (the user's choice).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (phaseRef.current !== 'ready') return;
      void isLockEnabled().then((on) => {
        if (on) setPhaseBoth('locked');
      });
    });
    return () => sub.remove();
  }, [setPhaseBoth]);

  const onAuthed = useCallback(
    async (acc: Account) => {
      setAccount(acc);
      setPhaseBoth((await isLockEnabled()) ? 'locked' : 'ready');
    },
    [setPhaseBoth],
  );

  if (phase === 'ready') return <>{children}</>;

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (phase === 'locked') {
    return <LockScreen account={account} onUnlocked={() => setPhaseBoth('ready')} />;
  }

  return (
    <AccountScreen
      mode={phase}
      onDone={onAuthed}
      onSwitch={() => setPhaseBoth(phase === 'signup' ? 'login' : 'signup')}
    />
  );
}

// ── Lock ─────────────────────────────────────────────────────────────────────

function LockScreen({ account, onUnlocked }: { account: Account | null; onUnlocked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    const ok = await promptUnlock();
    setBusy(false);
    if (ok) onUnlocked();
    else setFailed(true);
  }, [onUnlocked]);

  // Prompt straight away — the extra tap on every app open would get old fast.
  useEffect(() => {
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.center}>
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={styles.title}>Billing App is locked</Text>
      {account ? <Text style={styles.subtle}>{account.username}</Text> : null}
      {failed ? <Text style={styles.error}>Unlock cancelled or not recognised.</Text> : null}
      <Button label="Unlock" onPress={unlock} loading={busy} style={styles.wide} />
    </View>
  );
}

// ── Sign up / sign in ────────────────────────────────────────────────────────

function AccountScreen({
  mode,
  onDone,
  onSwitch,
}: {
  mode: 'signup' | 'login';
  onDone: (acc: Account) => void;
  onSwitch: () => void;
}) {
  const signingUp = mode === 'signup';
  // Forgotten the password: the same two fields, proved with the phone's lock
  // instead of the old password.
  const [resetting, setResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drivePicker, setDrivePicker] = useState(false);
  // A restore is good news, so it must not appear in the red error slot. The
  // login itself is never in a backup — it lives in SecureStore — so an account
  // still has to be made after restoring.
  const [notice, setNotice] = useState<string | null>(null);
  // Set while the just-created account waits for the restore sheet to close.
  const [pendingAccount, setPendingAccount] = useState<Account | null>(null);

  const submit = async () => {
    setError(null);
    if (signingUp && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const acc = signingUp
        ? await signUp({ email, username, password })
        : await signIn(username, password);
      if (signingUp) {
        // A brand-new account on a phone means either a first install or a
        // reinstall, and only the user knows which. Ask once, here, before they
        // start typing bills into an empty app — the WhatsApp moment.
        offerRestore(acc);
        return;
      }
      onDone(acc);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Prove the phone, set the new password, and walk straight in — somebody who
   * has just been locked out of their own till should not have to type it again.
   */
  const resetAndEnter = async () => {
    setError(null);
    setNotice(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithDeviceLock(password);
      const acc = await getAccount();
      if (!acc) throw new Error('No account on this device yet.');
      onDone(await signIn(acc.username, password));
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const offerRestore = (acc: Account) => {
    setBusy(false);
    Alert.alert(
      'Restore your data?',
      'If you used this app before and backed up to Google Drive, sign in with that same Google account and everything comes back.',
      [
        { text: 'Start fresh', style: 'cancel', onPress: () => onDone(acc) },
        {
          text: 'Restore from Drive',
          onPress: () => {
            setPendingAccount(acc);
            setDrivePicker(true);
          },
        },
      ],
      { cancelable: false },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Image source={require('@/assets/images/icon.png')} style={styles.brand} />
        <Text style={styles.title}>
          {resetting ? 'Set a new password' : signingUp ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text style={styles.subtle}>
          {resetting
            ? 'Nobody can email you a reset — nothing leaves this phone. Instead the phone itself will ask for your fingerprint, PIN or pattern, and then you choose a new password.'
            : signingUp
              ? 'Your login stays on this phone — there is no server. Your data can be backed up to your own Google Drive.'
              : 'Sign in to open your shop data.'}
        </Text>

        {signingUp ? (
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@gmail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            required
          />
        ) : null}

        {resetting ? null : (
          <TextField
            label={signingUp ? 'Username' : 'Username or email'}
            value={username}
            onChangeText={setUsername}
            placeholder="shopowner"
            autoCapitalize="none"
            required
          />
        )}

        <TextField
          label={resetting ? 'New password' : 'Password'}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••"
          secureTextEntry
          autoCapitalize="none"
          required
        />

        {signingUp || resetting ? (
          <TextField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••"
            secureTextEntry
            autoCapitalize="none"
            required
          />
        ) : null}

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={
            resetting
              ? '🔒  Check phone lock & save'
              : signingUp
                ? 'Create account'
                : 'Sign in'
          }
          onPress={resetting ? resetAndEnter : submit}
          loading={busy}
          style={styles.wide}
        />

        {/* Only offered where it is the answer: on the sign-in screen, to
            somebody who is already locked out. */}
        {!signingUp ? (
          <Pressable
            onPress={() => {
              setResetting(!resetting);
              setError(null);
              setNotice(null);
              setPassword('');
              setConfirm('');
            }}
            hitSlop={8}
          >
            <Text style={styles.switch}>
              {resetting ? 'Back to sign in' : 'Forgot your password?'}
            </Text>
          </Pressable>
        ) : null}

        {signingUp ? (
          <>
            <Text style={styles.warn}>
              Nothing leaves this phone, so nobody can email you a reset. If you forget it, the
              phone’s own fingerprint or PIN can set a new one — so keep a screen lock on this
              phone, and write the password down somewhere safe anyway.
            </Text>

            {/* The reinstall path: the phone's data is gone but Drive still has
                it. Restoring here brings the shop back before the first bill. */}
            <Button
              label="☁  Restore from Google Drive"
              tone="ghost"
              onPress={() => setDrivePicker(true)}
              style={styles.wide}
            />
          </>
        ) : null}

        {resetting ? null : (
          <Pressable onPress={onSwitch} hitSlop={8}>
            <Text style={styles.switch}>
              {signingUp ? 'Already have an account? Sign in' : 'Create a new account instead'}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <DriveRestorePicker
        visible={drivePicker}
        onClose={() => {
          setDrivePicker(false);
          // Signed up already? Then the account was only waiting on this sheet.
          if (pendingAccount) onDone(pendingAccount);
        }}
        onRestored={() =>
          setNotice(
            pendingAccount
              ? 'Your data is back.'
              : 'Your data is back. Create an account here to open it.',
          )
        }
      />
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
    gap: 12,
  },
  form: { padding: 24, gap: 14, flexGrow: 1, justifyContent: 'center' },
  // The shop's own mark, the same file the launcher icon comes from.
  brand: { width: 76, height: 76, alignSelf: 'center', resizeMode: 'contain' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center' },
  subtle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 19 },
  error: { color: '#c0392b', fontSize: 13, textAlign: 'center' },
  notice: {
    color: '#1a7a48',
    backgroundColor: '#e8f6ee',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  warn: { fontSize: 12, color: '#8a5a00', backgroundColor: '#fff4e5', borderRadius: 10, padding: 10, lineHeight: 18 },
  wide: { alignSelf: 'stretch', marginTop: 6 },
  switch: { color: '#208AEF', fontSize: 14, textAlign: 'center', fontWeight: '600', marginTop: 4 },
  lockIcon: { fontSize: 44 },
});
