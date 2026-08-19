// What is actually moving off the shelf. Quantity and value only — the profit
// report already answers "what did it earn"; this one answers "what sells".

import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportItemSalesExcel } from '@/modules/reports/excel';
import { itemSalesReport, percentOf, type ItemSalesReport } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney, formatQty } from '@/utils/format';

type Sort = 'value' | 'qty';

export default function ItemSalesReportScreen() {
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [sort, setSort] = useState<Sort>('value');
  const [report, setReport] = useState<ItemSalesReport | null>(null);

  useEffect(() => {
    let active = true;
    itemSalesReport(from, to).then((r) => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  // Sorting is a view choice, so it happens here rather than in another query.
  const rows = useMemo(() => {
    const list = [...(report?.rows ?? [])];
    return sort === 'qty' ? list.sort((a, b) => b.qty - a.qty) : list;
  }, [report, sort]);

  const best = rows[0];

  // "மொத்தம்" → the best seller, which is the whole point of the screen.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !report) return false;
    if (!best) return lang === 'ta-IN' ? 'விற்பனை இல்லை' : 'Nothing sold in this range';
    return lang === 'ta-IN'
      ? `${report.totalItems} பொருள், மொத்தம் ${formatMoney(report.totalValue)}. அதிகம் விற்றது ${best.name}`
      : `${report.totalItems} items, total ${formatMoney(report.totalValue)}. Best seller ${best.name}`;
  });

  return (
    <FlatList
      style={styles.screen}
      data={rows}
      keyExtractor={(r) => String(r.itemId)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

          <View style={styles.summary}>
            <Stat label="Items sold" value={String(report?.totalItems ?? 0)} />
            <Stat label="Sale value (before GST)" value={formatMoney(report?.totalValue ?? 0)} strong />
          </View>

          <View style={styles.sortRow}>
            {(['value', 'qty'] as Sort[]).map((s) => (
              <Pressable
                key={s}
                style={[styles.sortBtn, sort === s && styles.sortOn]}
                onPress={() => setSort(s)}
              >
                <Text style={[styles.sortText, sort === s && styles.sortTextOn]}>
                  {s === 'value' ? 'By value' : 'By quantity'}
                </Text>
              </Pressable>
            ))}
          </View>

          <ExcelExportButton onExport={() => exportItemSalesExcel(from, to)} />
          <Text style={styles.note}>Returns are already netted off both columns.</Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const share = percentOf(item.saleValue, report?.totalValue ?? 0);
        return (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.rowLeft}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowSub}>
                {formatQty(item.qty)} {item.unit} · {item.bills} bill{item.bills === 1 ? '' : 's'}
              </Text>
              {/* The bar is the share of the period's sales — a shelf ranking
                  reads faster as a length than as another number. */}
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, share))}%` }]} />
              </View>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{formatMoney(item.saleValue)}</Text>
              <Text style={styles.rowShare}>{share}%</Text>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>Nothing sold in this range.</Text>}
    />
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[styles.statValue, strong && styles.statStrong]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
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
    minWidth: '46%',
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statLabel: { fontSize: 12, color: '#888' },
  statValue: { fontSize: 16, fontWeight: '600', color: '#111' },
  statStrong: { color: '#208AEF', fontSize: 18, fontWeight: '700' },
  sortRow: { flexDirection: 'row', gap: 10 },
  sortBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  sortText: { fontSize: 13, fontWeight: '600', color: '#666' },
  sortTextOn: { color: '#208AEF' },
  note: { fontSize: 12, color: '#999' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rank: { fontSize: 13, color: '#bbb', fontWeight: '700', width: 20 },
  rowLeft: { flex: 1, gap: 4 },
  rowName: { fontSize: 15, color: '#111', fontWeight: '500' },
  rowSub: { fontSize: 12, color: '#999' },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: '#f0f0f3', overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: '#208AEF' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  rowShare: { fontSize: 12, color: '#999' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
