import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportStockExcel } from '@/modules/reports/excel';
import { stockSummary, type StockSummary } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney, formatQty } from '@/utils/format';

export default function StockReportScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [data, setData] = useState<StockSummary | null>(null);

  // "மொத்தம்" → stock value plus the out-of-stock count (the reorder cue).
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !data) return false;
    return lang === 'ta-IN'
      ? `${data.totalItems} பொருள், ஸ்டாக் மதிப்பு ${formatMoney(data.totalValue)}, ${data.lowStockCount} தீர்ந்துபோச்சு`
      : `${data.totalItems} items, stock value ${formatMoney(data.totalValue)}, ${data.lowStockCount} out of stock`;
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      stockSummary().then((d) => {
        if (active) setData(d);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <FlatList
      style={styles.screen}
      data={data?.rows ?? []}
      keyExtractor={(r) => String(r.item.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.summary}>
            <Stat label="Items" value={String(data?.totalItems ?? 0)} />
            <Stat label="Out of stock" value={String(data?.lowStockCount ?? 0)} />
            <Stat label="Stock value (cost)" value={formatMoney(data?.totalValue ?? 0)} strong />
          </View>
          <ExcelExportButton onExport={exportStockExcel} />
          <Text style={styles.sectionTitle}>Items</Text>
        </View>
      }
      renderItem={({ item: r }) => {
        const low = r.item.currentStock <= 0;
        return (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: r.item.id } })}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.name}>{r.item.name}</Text>
              <Text style={styles.sub}>{formatMoney(r.stockValue)} at cost</Text>
            </View>
            <Text style={[styles.stock, low && styles.stockLow]}>
              {formatQty(r.item.currentStock)} {r.item.unit}
            </Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>No items yet.</Text>}
    />
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, strong && styles.statStrong]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 32 },
  header: { padding: 16, gap: 14 },
  summary: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#f7f7f9', borderRadius: 12, padding: 12, gap: 4 },
  statLabel: { fontSize: 12, color: '#888' },
  statValue: { fontSize: 16, fontWeight: '600', color: '#111' },
  statStrong: { color: '#208AEF', fontSize: 17, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  sub: { fontSize: 13, color: '#888' },
  stock: { fontSize: 15, fontWeight: '600', color: '#111' },
  stockLow: { color: '#c0392b' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
