import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import { deleteItem, getItem } from '@/modules/items/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney, formatQty, formatTaxRate } from '@/utils/format';
import type { Item } from '@/db/schema';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);
  const router = useRouter();
  const { lang } = useVoice();
  const [item, setItem] = useState<Item | null | undefined>(undefined);

  // Voice: "மொத்தம்" reads stock + price; "மாத்து" opens the edit form.
  useVoiceCommands((intent) => {
    if (!item) return false;
    if (intent.kind === 'total') {
      return lang === 'ta-IN'
        ? `${item.name} இருப்பு ${formatQty(item.currentStock)} ${item.unit}, விலை ${formatMoney(item.salePrice)}`
        : `${item.name}: ${formatQty(item.currentStock)} ${item.unit} in stock at ${formatMoney(item.salePrice)}`;
    }
    if (intent.kind === 'setQty') {
      router.push({ pathname: '/item/adjust/[id]', params: { id: itemId } });
      return true;
    }
    return false;
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getItem(itemId).then((i) => {
        if (active) setItem(i ?? null);
      });
      return () => {
        active = false;
      };
    }, [itemId]),
  );

  const confirmDelete = () => {
    if (!item) return;
    Alert.alert('Delete item?', `"${item.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteItem(itemId);
            router.back();
          } catch {
            Alert.alert(
              'Cannot delete',
              'This item is used on one or more invoices. Remove those first.',
            );
          }
        },
      },
    ]);
  };

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
        <Stack.Screen options={{ title: 'Item' }} />
        <Text style={styles.missing}>Item not found.</Text>
      </View>
    );
  }

  const lowStock = item.currentStock <= 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: item.name,
          headerRight: () => (
            <Pressable
              hitSlop={8}
              onPress={() => router.push({ pathname: '/item/edit/[id]', params: { id: itemId } })}
            >
              <Text style={styles.headerAction}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.stockCard}>
          <Text style={styles.stockLabel}>In stock</Text>
          <Text style={[styles.stockValue, lowStock && styles.stockLow]}>
            {formatQty(item.currentStock)} {item.unit}
          </Text>
          {lowStock ? <Text style={styles.stockWarn}>Out of stock</Text> : null}
        </View>

        <View style={styles.details}>
          {item.category ? <Detail label="Category" value={item.category} /> : null}
          {item.hsnCode ? <Detail label="HSN / SAC" value={item.hsnCode} /> : null}
          <Detail label="Sale price" value={formatMoney(item.salePrice)} />
          <Detail label="Purchase price" value={formatMoney(item.purchasePrice)} />
          <Detail label="Tax rate" value={formatTaxRate(item.taxRate)} />
          <Detail label="Unit" value={item.unit} />
          <Detail label="Opening stock" value={`${formatQty(item.openingStock)} ${item.unit}`} />
        </View>

        <Button
          label="Adjust stock"
          tone="ghost"
          onPress={() => router.push({ pathname: '/item/adjust/[id]', params: { id: itemId } })}
        />

        <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Delete item</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
  headerAction: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
  container: { padding: 16, gap: 16 },
  stockCard: {
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  stockLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  stockValue: { fontSize: 28, fontWeight: '700', color: '#111' },
  stockLow: { color: '#c0392b' },
  stockWarn: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  details: { gap: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  detailLabel: { color: '#888', fontSize: 14 },
  detailValue: { color: '#111', fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  deleteBtn: { marginTop: 8, alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
