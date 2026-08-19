import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportGstExcel } from '@/modules/reports/excel';
import {
  gstRateBreakup,
  gstSummary,
  type GstRateRow,
  type GstSummary,
} from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney } from '@/utils/format';

export default function GstReportScreen() {
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<GstSummary | null>(null);
  // The same slab rows the Excel export carries — the summary header only holds
  // one rolled-up tax figure, and CGST/SGST/IGST is a per-line question.
  const [rates, setRates] = useState<{ sales: GstRateRow[]; purchases: GstRateRow[] } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([gstSummary(from, to), gstRateBreakup(from, to)]).then(([d, r]) => {
      if (!active) return;
      setData(d);
      setRates(r);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const netPayable = data?.netPayable ?? 0;
  const output = headTotals(rates?.sales, data?.outputTax ?? 0);
  const input = headTotals(rates?.purchases, data?.inputTax ?? 0);

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
        <TaxHeads totals={output} />
        <Line label="GST collected" value={formatMoney(data?.outputTax ?? 0)} strong />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Input tax (on purchases)</Text>
        <Line label="Taxable purchases" value={formatMoney(data?.taxablePurchases ?? 0)} />
        <TaxHeads totals={input} />
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

/**
 * CGST/SGST/IGST rolled up out of the slab rows, forced to add back to the tax
 * figure printed beside them. Re-deriving line by line can land a paise away
 * from the invoice headers (a tax-inclusive bill carves its tax out of the
 * gross); a stray paise is given to the head already carrying the most rather
 * than shown as three numbers that don't sum to the fourth.
 */
function headTotals(
  rows: GstRateRow[] | undefined,
  total: number,
): { cgst: number; sgst: number; igst: number } {
  const heads = {
    cgst: (rows ?? []).reduce((s, r) => s + r.cgst, 0),
    sgst: (rows ?? []).reduce((s, r) => s + r.sgst, 0),
    igst: (rows ?? []).reduce((s, r) => s + r.igst, 0),
  };
  const residual = total - (heads.cgst + heads.sgst + heads.igst);
  if (residual !== 0) {
    const biggest = (['cgst', 'sgst', 'igst'] as const).reduce((a, b) =>
      Math.abs(heads[b]) > Math.abs(heads[a]) ? b : a,
    );
    if (heads[biggest] !== 0) heads[biggest] += residual;
  }
  return heads;
}

/**
 * The three heads, each shown only when there is something under it — a shop
 * that never sells out of state never sees an IGST row, and one that only ever
 * does never sees CGST/SGST.
 */
function TaxHeads({ totals }: { totals: { cgst: number; sgst: number; igst: number } }) {
  return (
    <>
      {totals.cgst !== 0 ? <Line label="CGST" value={formatMoney(totals.cgst)} /> : null}
      {totals.sgst !== 0 ? <Line label="SGST" value={formatMoney(totals.sgst)} /> : null}
      {totals.igst !== 0 ? <Line label="IGST" value={formatMoney(totals.igst)} /> : null}
    </>
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
