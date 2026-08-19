import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ExcelExportButton from '@/components/ExcelExportButton';
import { STOCK_LABEL, STOCK_TONE } from '@/modules/items/stockLevel';
import { exportStockExcel } from '@/modules/reports/excel';
import { stockSummary, type StockSummary } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney, formatQty } from '@/utils/format';

export default function StockReportScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [data, setData] = useState<StockSummary | null>(null);
  // The shopping list, one tap away — for a shop with 200 items that is the
  // only view of this screen anybody actually acts on.
  const [reorderOnly, setReorderOnly] = useState(false);

  // "மொத்தம்" → stock value plus what needs buying.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !data) return false;
    return lang === 'ta-IN'
      ? `${data.totalItems} பொருள், ஸ்டாக் மதிப்பு ${formatMoney(data.totalValue)}, ${data.outOfStockCount} தீர்ந்துபோச்சு, ${data.lowStockCount} குறைவா இருக்கு`
      : `${data.totalItems} items, stock value ${formatMoney(data.totalValue)}, ${data.outOfStockCount} out of stock and ${data.lowStockCount} running low`;
  });

  const rows = useMemo(
    () => (reorderOnly ? (data?.rows ?? []).filter((r) => r.level !== 'ok') : (data?.rows ?? [])),
    [data, reorderOnly],
  );

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
      data={rows}
      keyExtractor={(r) => String(r.item.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.summary}>
            <Stat label="Items" value={String(data?.totalItems ?? 0)} />
            <Stat label="Out of stock" value={String(data?.outOfStockCount ?? 0)} />
            <Stat label="Running low" value={String(data?.lowStockCount ?? 0)} />
            <Stat label="Stock value (cost)" value={formatMoney(data?.totalValue ?? 0)} strong />
          </View>
          {data?.reorderCount ? (
            <Pressable
              style={[styles.reorderChip, reorderOnly && styles.reorderChipOn]}
              onPress={() => setReorderOnly((on) => !on)}
            >
              <Text style={[styles.reorderText, reorderOnly && styles.reorderTextOn]}>
                {reorderOnly
                  ? `Showing ${data.reorderCount} to reorder — show all`
                  : `${data.reorderCount} item(s) need reordering`}
              </Text>
            </Pressable>
          ) : null}
          <ExcelExportButton onExport={exportStockExcel} />
          <Text style={styles.sectionTitle}>{reorderOnly ? 'To reorder' : 'Items'}</Text>
        </View>
      }
      renderItem={({ item: r }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push({ pathname: '/item/[id]', params: { id: r.item.id } })}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.name}>{r.item.name}</Text>
            <Text style={styles.sub}>
              {formatMoney(r.stockValue)} at cost
              {r.level !== 'ok' ? ` · ${STOCK_LABEL[r.level]}` : ''}
            </Text>
          </View>
          <Text style={[styles.stock, { color: STOCK_TONE[r.level] }]}>
            {formatQty(r.item.currentStock)} {r.item.unit}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {reorderOnly ? 'Nothing needs reordering.' : 'No items yet.'}
        </Text>
      }
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
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  reorderChip: {
    borderWidth: 1,
    borderColor: '#f0c36d',
    backgroundColor: '#fdf6e6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  reorderChipOn: { borderColor: '#d68910', backgroundColor: '#fbeecf' },
  reorderText: { fontSize: 13, fontWeight: '600', color: '#8a6d1f' },
  reorderTextOn: { color: '#7a5a10' },
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
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
