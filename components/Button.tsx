import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

type Tone = 'primary' | 'danger' | 'ghost';

// Shared button for the module forms/screens (the Phase 1 debug screen keeps its
// own inline button and is intentionally left untouched).
export default function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ghost = tone === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        tone === 'primary' && styles.primary,
        tone === 'danger' && styles.danger,
        ghost && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ghost ? '#208AEF' : '#fff'} />
      ) : (
        <Text style={[styles.text, ghost && styles.ghostText]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: '#208AEF' },
  danger: { backgroundColor: '#c0392b' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#208AEF' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  text: { color: '#fff', fontWeight: '600', fontSize: 16 },
  ghostText: { color: '#208AEF' },
});
