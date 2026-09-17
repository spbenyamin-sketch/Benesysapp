// In the books, or kept out of them.
//
// A shop's Tally is not always the whole till. This is the one switch that says
// which side a bill, a payment or an expense falls on, and it is deliberately
// the same control on all three forms — a counter should never have to remember
// that it looks one way on a bill and another on a receipt.
//
// "In books" is the default everywhere, so a shop that never thinks about this
// has every transaction reach its accountant. Only the other choice says
// anything, which is why only the other choice explains itself.

import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function BooksToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Books</Text>
      <View style={styles.row}>
        {[true, false].map((on) => (
          <Pressable
            key={String(on)}
            style={[styles.chip, value === on && styles.chipOn]}
            onPress={() => onChange(on)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === on }}
          >
            <Text style={[styles.text, value === on && styles.textOn]}>
              {on ? 'In books' : 'Not in books'}
            </Text>
          </Pressable>
        ))}
      </View>
      {value ? null : (
        <Text style={styles.hint}>
          Stays out of the Tally export and the GST return. Your own reports still count it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#444' },
  row: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chipOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  text: { fontSize: 13, fontWeight: '600', color: '#666', textAlign: 'center' },
  textOn: { color: '#208AEF' },
  hint: { fontSize: 12, color: '#888', lineHeight: 17 },
  inlineMark: { color: '#b06a00', fontWeight: '600' },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fdf3e2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: '#b06a00' },
});

/**
 * Says a row is out of the books — in a list, as part of the line that already
 * reads "12 Aug · UPI · INV/2026-27/004"; on a document, as a pill beside its
 * heading. Nothing is drawn for a row that is in the books, which is nearly all
 * of them: the marking is what is worth saying, not the normal.
 */
export function NotInBooks({ inline = false }: { inline?: boolean }) {
  if (inline) return <Text style={styles.inlineMark}> · Not in books</Text>;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>Not in books</Text>
    </View>
  );
}
