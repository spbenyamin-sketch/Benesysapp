import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportSalesReportExcel } from '@/modules/reports/excel';
import { salesReport, type SalesReport } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';

export default function SalesReportScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [report, setReport] = useState<SalesReport | null>(null);

  useEffect(() => {
    let active = true;
    salesReport(from, to).then((r) => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  // "மொத்தம்" reads the report summary out loud, so the shopkeeper never has to
  // squint at the screen. ("எக்செல்" is handled by ExcelExportButton below.)
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total') return false;
    if (!report) return false;
    return lang === 'ta-IN'
      ? `${report.count} பில், மொத்த விற்பனை ${formatMoney(report.grandTotal)}, வரி ${formatMoney(report.taxTotal)}`
      : `${report.count} invoices, total sales ${formatMoney(report.grandTotal)}, tax ${formatMoney(report.taxTotal)}`;
  });

  return (
    <FlatList
      style={styles.screen}
      data={report?.rows ?? []}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <View style={styles.summary}>
            <Stat label="Invoices" value={String(report?.count ?? 0)} />
            <Stat label="Subtotal" value={formatMoney(report?.subtotal ?? 0)} />
            <Stat label="Tax" value={formatMoney(report?.taxTotal ?? 0)} />
            <Stat label="Net total" value={formatMoney(report?.grandTotal ?? 0)} strong />
          </View>
          {!!report?.returnCount && (
            <Text style={styles.returnNote}>
              Less {report.returnCount} sale return(s) worth {formatMoney(report.returnTotal)} —
              already taken off the totals above.
            </Text>
          )}
          <ExcelExportButton onExport={() => exportSalesReportExcel(from, to)} />
          <Text style={styles.sectionTitle}>Invoices</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: item.id } })}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.rowNo}>{item.invoiceNo}</Text>
            <Text style={styles.rowSub}>
              {item.partyName} · {formatDate(item.date)}
            </Text>
          </View>
          <Text style={styles.rowAmount}>{formatMoney(item.grandTotal)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No sales in this range.</Text>}
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
  stat: { flexGrow: 1, minWidth: '46%', backgroundColor: '#f7f7f9', borderRadius: 12, padding: 12, gap: 4 },
  statLabel: { fontSize: 12, color: '#888' },
  statValue: { fontSize: 16, fontWeight: '600', color: '#111' },
  statStrong: { color: '#208AEF', fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  returnNote: { fontSize: 13, color: '#b8860b', lineHeight: 18 },
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
  rowNo: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 13, color: '#888' },
  rowAmount: { fontSize: 15, fontWeight: '700', color: '#111' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
