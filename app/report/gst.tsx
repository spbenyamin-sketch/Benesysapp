import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportGstExcel } from '@/modules/reports/excel';
import { gstSummary, type GstSummary } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney } from '@/utils/format';

export default function GstReportScreen() {
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<GstSummary | null>(null);

  useEffect(() => {
    let active = true;
    gstSummary(from, to).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const netPayable = data?.netPayable ?? 0;

  // "மொத்தம்" → the one number the shopkeeper actually wants: net GST to pay.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !data) return false;
    const net = formatMoney(Math.abs(netPayable));
    return lang === 'ta-IN'
      ? `வசூலித்த வரி ${formatMoney(data.outputTax)}, கட்டிய வரி ${formatMoney(data.inputTax)}, ${
          netPayable >= 0 ? `கட்ட வேண்டியது ${net}` : `கிரெடிட் ${net}`
        }`
      : `Output tax ${formatMoney(data.outputTax)}, input tax ${formatMoney(data.inputTax)}, ${
          netPayable >= 0 ? `net payable ${net}` : `net credit ${net}`
        }`;
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Output tax (on sales)</Text>
        <Line label="Taxable sales" value={formatMoney(data?.taxableSales ?? 0)} />
        <Line label="GST collected" value={formatMoney(data?.outputTax ?? 0)} strong />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Input tax (on purchases)</Text>
        <Line label="Taxable purchases" value={formatMoney(data?.taxablePurchases ?? 0)} />
        <Line label="GST paid (input credit)" value={formatMoney(data?.inputTax ?? 0)} strong />
      </View>

      <View style={styles.netCard}>
        <Text style={styles.netLabel}>{netPayable >= 0 ? 'Net GST payable' : 'Net input credit'}</Text>
        <Text style={[styles.netValue, { color: netPayable >= 0 ? '#c0392b' : '#1a9d5a' }]}>
          {formatMoney(Math.abs(netPayable))}
        </Text>
        <Text style={styles.netHint}>Output tax − input tax</Text>
      </View>

      <ExcelExportButton onExport={() => exportGstExcel(from, to)} />
      <Text style={styles.disclaimer}>
        The Excel file has 5 sheets: summary, sales &amp; purchase rate-wise slabs, and the
        invoice lists. Summary figures for reference only — not a filed GSTR return.
      </Text>
    </ScrollView>
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
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  block: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 14, gap: 8 },
  blockTitle: { fontSize: 14, fontWeight: '700', color: '#555' },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 15, color: '#666' },
  lineValue: { fontSize: 15, color: '#111' },
  lineStrong: { fontWeight: '700', color: '#111' },
  netCard: { backgroundColor: '#f4f8fe', borderRadius: 14, padding: 18, alignItems: 'center', gap: 4 },
  netLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  netValue: { fontSize: 28, fontWeight: '700' },
  netHint: { fontSize: 12, color: '#999' },
  disclaimer: { fontSize: 12, color: '#999', textAlign: 'center' },
});
