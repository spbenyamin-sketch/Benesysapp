// What the shop spent on stock, and who it went to.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportPurchaseReportExcel } from '@/modules/reports/excel';
import { percentOf, purchaseReport, type PurchaseReport } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';

export default function PurchaseReportScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [report, setReport] = useState<PurchaseReport | null>(null);

  useEffect(() => {
    let active = true;
    purchaseReport(from, to).then((r) => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !report) return false;
    return lang === 'ta-IN'
      ? `${report.count} பர்ச்சேஸ், மொத்தம் ${formatMoney(report.grandTotal)}, வரி ${formatMoney(report.taxTotal)}`
      : `${report.count} purchase bills, total ${formatMoney(report.grandTotal)}, tax ${formatMoney(report.taxTotal)}`;
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
            <Stat label="Bills" value={String(report?.count ?? 0)} />
            <Stat label="Before GST" value={formatMoney(report?.subtotal ?? 0)} />
            <Stat label="Input GST" value={formatMoney(report?.taxTotal ?? 0)} />
            <Stat label="Total spent" value={formatMoney(report?.grandTotal ?? 0)} strong />
          </View>

          {report?.returnCount ? (
            <Text style={styles.returnNote}>
              Less {report.returnCount} purchase return(s) worth {formatMoney(report.returnTotal)} —
              already taken off the totals above.
            </Text>
          ) : null}

          {report?.suppliers.length ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Where it went</Text>
              {report.suppliers.slice(0, 8).map((s) => (
                <Pressable
                  key={s.partyId}
                  style={styles.supplierRow}
                  onPress={() => router.push({ pathname: '/party/[id]', params: { id: s.partyId } })}
                >
                  <Text style={styles.supplierName} numberOfLines={1}>
                    {s.partyName}
                  </Text>
                  <Text style={styles.supplierShare}>
                    {percentOf(s.total, report.grandTotal)}%
                  </Text>
                  <Text style={styles.supplierTotal}>{formatMoney(s.total)}</Text>
                </Pressable>
              ))}
              {report.suppliers.length > 8 ? (
                <Text style={styles.more}>+ {report.suppliers.length - 8} more suppliers</Text>
              ) : null}
            </View>
          ) : null}

          <ExcelExportButton onExport={() => exportPurchaseReportExcel(from, to)} />
          <Text style={styles.sectionTitle}>Purchase bills</Text>
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
      ListEmptyComponent={<Text style={styles.empty}>No purchases in this range.</Text>}
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
  statStrong: { color: '#6b4fbb', fontSize: 18, fontWeight: '700' },
  block: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 14, gap: 8 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: '#555' },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  supplierName: { flex: 1, fontSize: 14, color: '#111' },
  supplierShare: { fontSize: 12, color: '#999', width: 46, textAlign: 'right' },
  supplierTotal: { fontSize: 14, fontWeight: '600', color: '#111' },
  more: { fontSize: 12, color: '#999' },
  returnNote: { fontSize: 13, color: '#b8860b', lineHeight: 18 },
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
  rowNo: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 13, color: '#888' },
  rowAmount: { fontSize: 15, fontWeight: '700', color: '#111' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
