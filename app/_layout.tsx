import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDbMigrations } from '@/db/migrate';
import AuthGate from '@/components/AuthGate';
import BackupOnExit from '@/components/BackupOnExit';
import VoiceMic from '@/components/VoiceMic';
import { VoiceProvider } from '@/modules/voice/VoiceProvider';
import { useAutoBackup } from '@/modules/backup/useAutoBackup';

export default function RootLayout() {
  const { success, error } = useDbMigrations();

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Database error</Text>
        <Text style={styles.errorMsg}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>Preparing database…</Text>
      </View>
    );
  }

  // AuthGate is outermost (after the DB is ready): while it shows the login or
  // lock screen the navigator isn't mounted at all, so no shop data is reachable.
  // Inside it, VoiceProvider wraps everything so any screen can register voice
  // commands, and the mic renders AFTER the Stack so it floats above every screen.
  return (
    <SafeAreaProvider>
      <AuthGate>
        <VoiceProvider>
          <AutoBackupRunner />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
          <VoiceMic />
          <BackupOnExit />
          <StatusBar style="auto" />
        </VoiceProvider>
      </AuthGate>
    </SafeAreaProvider>
  );
}

/** Headless: checks on mount/foreground whether a scheduled backup is due. */
function AutoBackupRunner() {
  useAutoBackup();
  return null;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loading: { color: '#888' },
  errorTitle: { fontSize: 18, fontWeight: '600', color: '#c0392b' },
  errorMsg: { color: '#888', textAlign: 'center' },
});
