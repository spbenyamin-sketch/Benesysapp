import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// Google's sign-in callback comes back to the phone as a deep link
// (com.benesys.billingapp:/oauth2redirect?code=…). expo-web-browser is what
// consumes it — it closes the browser tab and hands the code to the
// connectDrive() call still waiting in modules/backup/drive.ts — but the router
// sees the very same link and looks for a route to navigate to. There was none,
// so every sign-in dumped the user on the "Unmatched Route" screen.
//
// This screen exists only to be that destination. It shows a spinner for the
// instant it is mounted, then steps back to whatever screen started the
// sign-in, leaving the token work entirely to drive.ts.
export default function OAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // Cold start: Android launched the app fresh with the callback intent, so
      // there is no sign-in screen to return to. The Dashboard is the sane home.
      router.replace('/');
    }
  }, [router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
