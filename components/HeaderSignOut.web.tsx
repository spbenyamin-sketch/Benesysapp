// Online mode is used on a shared counter machine, often by whoever is standing
// there. Signing out is what ends a turn, so it sits in the corner of every
// page rather than three taps away inside Settings.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getAccount, signOut, type Account } from '@/modules/auth/service';

export default function HeaderSignOut() {
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    let active = true;
    getAccount()
      .then((a) => {
        if (active) setAccount(a);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const doSignOut = () => {
    // react-native-web's Alert shows nothing, so the browser's own confirm asks
    // instead, and a reload brings the sign-in screen back.
    if (window.confirm('Sign out? You will need your password to get back in.')) {
      void signOut().then(() => window.location.reload());
    }
  };

  return (
    <View style={styles.row}>
      {/* Who is signed in matters on a machine several people share; on a narrow
          window it is the first thing to go. */}
      {account ? (
        <Text style={styles.who} numberOfLines={1}>
          {account.username}
        </Text>
      ) : null}
      <Pressable style={styles.btn} onPress={doSignOut} accessibilityRole="button">
        <Text style={styles.label}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 14 },
  who: { fontSize: 13, color: '#666', maxWidth: 160 },
  btn: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  label: { color: '#c0392b', fontWeight: '700', fontSize: 13 },
});
