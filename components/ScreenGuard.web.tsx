// Online mode: the tab bar only offers what this person was given, but the
// address bar will still take them anywhere. This covers a screen that is not
// theirs with a plain explanation and a way back.
//
// It covers rather than replaces the navigator: unmounting it would strand the
// "Go to" button with nothing to navigate. What the shop actually protects —
// its takings — the server refuses as well (server/src/routes/rpc.ts).

import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import { useAllowedScreens } from '@/modules/auth/allowed';
import { SCREEN_LABEL, screenOfPath, type Screen } from '@/modules/auth/screens';

/** Spelled out rather than built from the name, so typed routes still check it. */
const TAB_PATH = {
  dashboard: '/dashboard',
  quickbill: '/quickbill',
  parties: '/parties',
  items: '/items',
  reports: '/reports',
} as const satisfies Record<Screen, string>;

export default function ScreenGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = useAllowedScreens();
  const needed = screenOfPath(pathname);
  const blocked = needed !== null && !allowed.includes(needed);

  // Somewhere they can certainly go: their first tab, or Settings, which
  // everyone keeps so they can sign out.
  const home = allowed.length ? TAB_PATH[allowed[0]] : '/settings';

  return (
    <>
      {children}
      {blocked ? (
        <View style={styles.cover}>
          <Text style={styles.title}>Not your screen</Text>
          <Text style={styles.body}>
            {SCREEN_LABEL[needed]} is switched off for your account. Ask the shop owner if you need
            it.
          </Text>
          <Button
            label={allowed.length ? `Go to ${SCREEN_LABEL[allowed[0]]}` : 'Go to Settings'}
            onPress={() => router.replace(home)}
            style={styles.button}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#f4f5f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  body: { fontSize: 14, color: '#888', textAlign: 'center', maxWidth: 380, lineHeight: 20 },
  button: { minWidth: 220, marginTop: 4 },
});
