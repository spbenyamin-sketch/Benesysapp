// Online mode's gate: sign in to the shop on the server, or — on a fresh install
// only — register it.
// Like the phone's AuthGate, nothing underneath is mounted until signed in.

import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import { t } from '@/i18n';
import {
  canRegisterShop,
  checkSession,
  registerShop,
  signIn,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/modules/auth/service.web';
import { getSession, onSessionChange } from '@/web/session';

type Phase = 'checking' | 'login' | 'register' | 'ready' | 'offline';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(getSession() ? 'checking' : 'login');

  // Signed in or out anywhere (this form, Settings, the server refusing the token).
  useEffect(() => onSessionChange((s) => setPhase(s ? 'ready' : 'login')), []);

  // A token saved from an earlier visit is only trusted once the server agrees.
  useEffect(() => {
    if (phase !== 'checking') return;
    checkSession()
      .then((ok) => setPhase(ok ? 'ready' : 'login'))
      .catch(() => setPhase('offline'));
  }, [phase]);

  // A server takes exactly one shop sign-up, on a fresh install. Until then the
  // form opens on it; after that the link is not offered at all.
  const [canRegister, setCanRegister] = useState(false);
  const signingIn = phase === 'login' || phase === 'register';
  useEffect(() => {
    if (!signingIn) return;
    let live = true;
    canRegisterShop().then((yes) => {
      if (!live) return;
      setCanRegister(yes);
      setPhase((p) => (yes && p === 'login' ? 'register' : !yes && p === 'register' ? 'login' : p));
    });
    return () => {
      live = false;
    };
  }, [signingIn]);

  if (phase === 'ready') return <>{children}</>;

  if (phase === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (phase === 'offline') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{t('Cannot reach the server')}</Text>
        <Text style={styles.subtle}>{t('Make sure start-web.bat is running on the shop computer.')}</Text>
        <Button label={t('Try again')} onPress={() => setPhase('checking')} style={styles.narrow} />
      </View>
    );
  }

  return (
    <SignInScreen
      mode={phase}
      onSwitch={canRegister ? () => setPhase(phase === 'login' ? 'register' : 'login') : undefined}
    />
  );
}

function SignInScreen({ mode, onSwitch }: { mode: 'login' | 'register'; onSwitch?: () => void }) {
  const registering = mode === 'register';
  const [shopName, setShopName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (registering) {
      const problem =
        (shopName.trim() ? null : t('Shop name is required.')) ??
        validateEmail(email) ??
        validateUsername(username) ??
        validatePassword(password) ??
        (password === confirm ? null : t('Passwords do not match.'));
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    try {
      // Success flips the gate through onSessionChange.
      if (registering) await registerShop({ shopName: shopName.trim(), email, username, password });
      else await signIn(username, password);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Image source={require('@/assets/images/icon.png')} style={styles.brand} />
        <Text style={styles.title}>{registering ? t('Register your shop') : t('Sign in')}</Text>
        {/* Signing in needs no explanation; registering a shop does. */}
        {registering ? (
          <Text style={styles.subtle}>
            {t('Creates the shop on this server with you as its owner. Add your staff from Settings afterwards.')}
          </Text>
        ) : null}

        {registering ? (
          <TextField label={t('Shop name')} value={shopName} onChangeText={setShopName} placeholder="Kannan Stores" required />
        ) : null}
        {registering ? (
          <TextField
            label={t('Email')}
            value={email}
            onChangeText={setEmail}
            placeholder="you@gmail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            required
          />
        ) : null}
        <TextField
          label={registering ? t('Username') : t('Username or email')}
          value={username}
          onChangeText={setUsername}
          placeholder="shopowner"
          autoCapitalize="none"
          required
        />
        <TextField
          label={t('Password')}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          required
        />
        {registering ? (
          <TextField
            label={t('Confirm password')}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            required
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={registering ? t('Register shop') : t('Sign in')} onPress={submit} loading={busy} style={styles.wide} />

        {/* There is no mail server to send a reset link through, so the honest
            answer is where to go: the owner resets staff in the app, and the
            computer holding the books resets the owner. */}
        {registering ? null : (
          <Pressable onPress={() => setForgot(!forgot)} hitSlop={8}>
            <Text style={styles.switch}>{t('Forgot your password?')}</Text>
          </Pressable>
        )}
        {forgot && !registering ? (
          <Text style={styles.forgot}>
            {t('Staff: ask the shop owner — they set it in Settings → People.')}{'\n\n'}
            {t('Owner: on the computer that runs the books, double-click')}{' '}
            <Text style={styles.code}>reset-password.bat</Text>{' '}
            {t('(next to start-web.bat). It asks which account and what the new password should be.')}
          </Text>
        ) : null}

        {onSwitch ? (
          <Pressable onPress={onSwitch} hitSlop={8}>
            <Text style={styles.switch}>
              {registering ? t('Already have an account? Sign in') : t('New shop? Register it here')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

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
  // The shop's own mark, the same file the phone's launcher icon comes from.
  brand: { width: 76, height: 76, alignSelf: 'center', resizeMode: 'contain' },
  title: { fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center' },
  subtle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 19 },
  error: { color: '#c0392b', fontSize: 13, textAlign: 'center' },
  wide: { alignSelf: 'stretch', marginTop: 6 },
  narrow: { minWidth: 200 },
  switch: { color: '#208AEF', fontSize: 14, textAlign: 'center', fontWeight: '600', marginTop: 4 },
  forgot: { fontSize: 13, color: '#555', lineHeight: 19, backgroundColor: '#f4f8fe', borderRadius: 10, padding: 12 },
  code: { fontWeight: '700', color: '#111' },
});
