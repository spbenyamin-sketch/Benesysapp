// An item's picture, with a readable fallback when there is no photo yet: the
// first letter of the name on a colour derived from that name, so the same item
// always looks the same on the counter screen.

import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const TONES = ['#208AEF', '#1a9d5a', '#e17055', '#6c5ce7', '#d63031', '#00a8a8', '#f0932b', '#2d3436'];

function toneFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum = (sum + name.charCodeAt(i)) % 4096;
  return TONES[sum % TONES.length];
}

export default function ItemPhoto({
  uri,
  name,
  size = 48,
  radius,
  style,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  /** Corner radius; defaults to a rounded square that scales with `size`. */
  radius?: number;
  /** Extra layout style — margins/self-alignment, nothing image-specific. */
  style?: StyleProp<ViewStyle>;
}) {
  const borderRadius = radius ?? Math.round(size * 0.22);
  const box = { width: size, height: size, borderRadius };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[box, styles.image, style as StyleProp<ImageStyle>]}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
      />
    );
  }

  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={[box, styles.fallback, { backgroundColor: toneFor(name) }, style]}>
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.42) }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#f2f2f4' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '700' },
});
