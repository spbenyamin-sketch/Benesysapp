import { StyleSheet, Text, TextInput, View } from 'react-native';
import { financialYear } from '@/utils/invoiceNumber';

// Simple ISO (YYYY-MM-DD) from/to inputs — no date-picker lib. Defaults come
// from defaultRange() below (current financial year → today).
export function defaultRange(now: Date): { from: string; to: string } {
  return { from: financialYear(now).start, to: now.toISOString().slice(0, 10) };
}

export default function DateRange({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <Text style={styles.label}>From</Text>
        <TextInput
          style={styles.input}
          value={from}
          onChangeText={onFrom}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.col}>
        <Text style={styles.label}>To</Text>
        <TextInput
          style={styles.input}
          value={to}
          onChangeText={onTo}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#444' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
});
