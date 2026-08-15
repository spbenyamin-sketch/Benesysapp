// What the shop actually earned over a period, and which items earned it.
//
// Read top to bottom it is a small P&L: sales, less the discount given away,
// less what the goods cost, = gross profit; less the overheads paid in the same
// period, = net profit. GST never appears — tax collected is the government's
// money passing through, not income.

import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportProfitExcel } from '@/modules/reports/excel';
import { marginPercent, profitReport, type ProfitReport } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney, formatQty } from '@/utils/format';

export default function ProfitReportScreen() {
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [report, setReport] = useState<ProfitReport | null>(null);

  useEffect(() => {
    let active = true;
    profitReport(from, to).then((r) => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const net = report?.netProfit ?? 0;
  const gross = report?.grossProfit ?? 0;

  // "மொத்தம்" → the two numbers worth hearing out loud: gross and net.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !report) return false;
    const netWord = net >= 0 ? (lang === 'ta-IN' ? 'லாபம்' : 'profit') : lang === 'ta-IN' ? 'நஷ்டம்' : 'loss';
    return lang === 'ta-IN'
      ? `விற்பனை ${formatMoney(report.netSaleValue)}, மொத்த லாபம் ${formatMoney(gross)}, செலவு போக ${netWord} ${formatMoney(Math.abs(net))}`
      : `Sales ${formatMoney(report.netSaleValue)}, gross profit ${formatMoney(gross)}, net ${netWord} ${formatMoney(Math.abs(net))}`;
  });

  return (
    <FlatList
      style={styles.screen}
      data={report?.items ?? []}
      keyExtractor={(r) => String(r.itemId)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

          <View style={styles.block}>
            <Line label="Sale value (before GST)" value={formatMoney(report?.saleValue ?? 0)} />
            <Line label="Less: discount given" value={`− ${formatMoney(report?.discount ?? 0)}`} />
            <Line label="Net sales" value={formatMoney(report?.netSaleValue ?? 0)} strong />
            <Line label="Less: cost of goods sold" value={`− ${formatMoney(report?.costValue ?? 0)}`} />
            <View style={styles.divider} />
            <Line
              label={`Gross profit (${marginPercent(gross, report?.netSaleValue ?? 0)}%)`}
              value={formatMoney(gross)}
              strong
            />
            <Line label="Less: expenses" value={`− ${formatMoney(report?.expenses ?? 0)}`} />
          </View>

          <View style={styles.netCard}>
            <Text style={styles.netLabel}>{net >= 0 ? 'Net profit' : 'Net loss'}</Text>
            <Text style={[styles.netValue, { color: net >= 0 ? '#1a9d5a' : '#c0392b' }]}>
              {formatMoney(Math.abs(net))}
            </Text>
            <Text style={styles.netHint}>
              {report?.invoiceCount ?? 0} sale bill(s) · gross profit − expenses
            </Text>
          </View>

          {!!report?.expenseRows.length && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Expenses in this period</Text>
              {report.expenseRows.map((e) => (
                <Line key={e.category} label={`${e.category} (${e.count})`} value={formatMoney(e.total)} />
              ))}
            </View>
          )}

          <ExcelExportButton onExport={() => exportProfitExcel(from, to)} />

          {!!report && (report.estimatedLines > 0 || report.zeroCostLines > 0) && (
            <Text style={styles.warn}>
              {report.estimatedLines > 0 &&
                `${report.estimatedLines} line(s) were billed before cost was recorded — valued at today's purchase price. `}
              {report.zeroCostLines > 0 &&
                `${report.zeroCostLines} line(s) have no purchase price on the item, so they read as pure profit.`}
            </Text>
          )}

          <Text style={styles.sectionTitle}>Item-wise profit</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowSub}>
              {formatQty(item.qty)} {item.unit} · sold {formatMoney(item.saleValue)} · cost{' '}
              {formatMoney(item.costValue)}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowProfit, item.profit < 0 && styles.rowLoss]}>
              {formatMoney(item.profit)}
            </Text>
            <Text style={styles.rowMargin}>{marginPercent(item.profit, item.saleValue)}%</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No sales in this range.</Text>}
    />
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.lineStrong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  header: { padding: 16, gap: 16 },
  block: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 14, gap: 8 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: '#555' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e5e5e5' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: 15, color: '#666' },
  lineValue: { fontSize: 15, color: '#111' },
  lineStrong: { fontWeight: '700', color: '#111' },
  netCard: { backgroundColor: '#f4f8fe', borderRadius: 14, padding: 18, alignItems: 'center', gap: 4 },
  netLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  netValue: { fontSize: 28, fontWeight: '700' },
  netHint: { fontSize: 12, color: '#999', textAlign: 'center' },
  warn: { fontSize: 12, color: '#b8860b', lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 3 },
  rowName: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 12, color: '#888' },
  rowRight: { alignItems: 'flex-end' },
  rowProfit: { fontSize: 15, fontWeight: '700', color: '#1a9d5a' },
  rowLoss: { color: '#c0392b' },
  rowMargin: { fontSize: 12, color: '#888' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
