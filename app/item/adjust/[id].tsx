import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import { adjustStock, getItem } from '@/modules/items/service';
import { useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatQty, parseQtyToThousandths } from '@/utils/format';
import type { Item } from '@/db/schema';

type Mode = 'add' | 'reduce' | 'set';

const MODES: { key: Mode; label: string }[] = [
  { key: 'add', label: 'Add' },
  { key: 'reduce', label: 'Reduce' },
  { key: 'set', label: 'Set to' },
];

export default function AdjustStockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);
  const router = useRouter();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('add');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getItem(itemId).then((i) => setItem(i ?? null));
  }, [itemId]);

  // Defined ABOVE the loading/missing early-returns so the hooks below (and the
  // voice handler) always run in the same order.
  const amount = parseQtyToThousandths(qty);
  const nextStock =
    mode === 'add' ? (item?.currentStock ?? 0) + amount
    : mode === 'reduce' ? (item?.currentStock ?? 0) - amount
    : amount;

  const apply = async () => {
    if (!item) return;
    if (amount <= 0) {
      Alert.alert('Enter a quantity', 'Please enter a quantity greater than zero.');
      return;
    }
    if (nextStock < 0) {
      Alert.alert('Not enough stock', `Reducing by ${formatQty(amount)} would go below zero.`);
      return;
    }
    setSaving(true);
    try {
      await adjustStock(itemId, nextStock);
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not adjust', (e as Error)?.message ?? String(e));
    }
  };

  // Voice: "பத்து சேர்" → add 10 · "ஐந்து குறை" → reduce 5 · "இருபது ஆக்கு" → set
  // to 20 · "சேமி" applies it.
  useVoiceCommands((intent) => {
    switch (intent.kind) {
      case 'addLine':
        setMode('add');
        setQty(String(intent.qty));
        return true;
      case 'removeLine':
        setMode('reduce');
        if (intent.qty) setQty(String(intent.qty));
        return true;
      case 'setQty':
        setMode('set');
        setQty(String(intent.qty));
        return true;
      case 'setField':
        if (intent.field !== 'qty') return false;
        setQty(intent.value);
        return true;
      case 'submit':
        void apply();
        return true;
      default:
        return false;
    }
  });

  if (item === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Item not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.currentCard}>
        <Text style={styles.currentLabel}>Current stock</Text>
        <Text style={styles.currentValue}>
          {formatQty(item.currentStock)} {item.unit}
        </Text>
      </View>

      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <Pressable
              key={m.key}
              style={[styles.modeChip, active && styles.modeChipActive]}
              onPress={() => setMode(m.key)}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label={`Quantity (${item.unit})`}
        value={qty}
        onChangeText={setQty}
        placeholder="0"
        keyboardType="numeric"
      />

      <Text style={styles.preview}>
        New stock: <Text style={styles.previewValue}>{formatQty(Math.max(nextStock, 0))} {item.unit}</Text>
      </Text>

      <Button label="Apply adjustment" onPress={apply} loading={saving} style={styles.apply} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
  container: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 16 },
  currentCard: {
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  currentLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  currentValue: { fontSize: 26, fontWeight: '700', color: '#111' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  modeChipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  modeText: { fontWeight: '600', color: '#666' },
  modeTextActive: { color: '#fff' },
  preview: { fontSize: 14, color: '#666', marginTop: -6 },
  previewValue: { color: '#111', fontWeight: '700' },
  apply: { marginTop: 8 },
});
