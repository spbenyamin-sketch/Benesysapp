import { StyleSheet, Text, View } from 'react-native';

/**
 * Temporary empty-screen placeholder used across Phase 0.
 * Each module screen replaces this with real UI in its own phase.
 */
export default function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>Coming in {phase}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
});
