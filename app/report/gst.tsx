import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import DateRange, { defaultRange } from '@/components/DateRange';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportGstExcel } from '@/modules/reports/excel';
import {
  gstr1Filename,
  reconcileTaxHeads,
  type Gstr3bSummary,
  type TaxHeads,
} from '@/modules/reports/gstr';
import {
  gstr1Report,
  gstr3bReport,
  gstRateBreakup,
  gstSummary,
  type GstRateRow,
  type GstSummary,
} from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';
import { downloadFile, isWeb } from '@/utils/webFile';

export default function GstReportScreen() {
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [data, setData] = useState<GstSummary | null>(null);
  // The same slab rows the Excel export carries — the summary header only holds
  // one rolled-up tax figure, and CGST/SGST/IGST is a per-line question.
  const [rates, setRates] = useState<{ sales: GstRateRow[]; purchases: GstRateRow[] } | null>(null);
  // A return is filed for a calendar MONTH, never for whatever range the summary
  // above happens to be showing — so filing gets its own control rather than
  // borrowing one that means something else.
  const [month, setMonth] = useState(init.to.slice(0, 7));
  const [filing, setFiling] = useState<Gstr3bSummary | null>(null);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    let active = true;
    setFiling(null);
    gstr3bReport(month).then((f) => {
      if (active) setFiling(f);
    });
    return () => {
      active = false;
    };
  }, [month]);

  const netPayable = data?.netPayable ?? 0;
  const output = reconcileTaxHeads(rates?.sales, data?.outputTax ?? 0);
  const input = reconcileTaxHeads(rates?.purchases, data?.inputTax ?? 0);

  const exportJson = () => {
    if (busy) return;
    setBusy(true);
    shareGstr1(month)
      .catch((e: unknown) => Alert.alert('Export failed', (e as Error)?.message ?? String(e)))
      .finally(() => setBusy(false));
  };

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
        <TaxHeadLines totals={output} />
        <Line label="GST collected" value={formatMoney(data?.outputTax ?? 0)} strong />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Input tax (on purchases)</Text>
        <Line label="Taxable purchases" value={formatMoney(data?.taxablePurchases ?? 0)} />
        <TaxHeadLines totals={input} />
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

      {/* Filing is a separate job from reading the summary, so it gets its own
          block with its own month — a return covers a calendar month. */}
      <View style={styles.filing}>
        <Text style={styles.blockTitle}>File for this month</Text>
        <View style={styles.monthRow}>
          <Step label="‹" onPress={() => setMonth(shiftMonth(month, -1))} />
          <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
          <Step label="›" onPress={() => setMonth(shiftMonth(month, 1))} />
        </View>

        <Line label="Outward taxable supplies (3.1a)" value={rupees(filing?.outward.txval)} />
        <Line label="Tax on them" value={rupees(taxOf(filing?.outward))} />
        <Line label="Eligible input tax (4A5)" value={rupees(taxOf(filing?.itc))} />
        <Line
          label={(filing?.netPayable ?? 0) >= 0 ? 'To pay' : 'Credit carried forward'}
          value={rupees(Math.abs(filing?.netPayable ?? 0))}
          strong
        />

        <Button label="⬇  Export GSTR-1 JSON" tone="ghost" onPress={exportJson} loading={busy} />
        <Text style={styles.disclaimer}>
          The JSON the government&apos;s offline utility reads — sales, counter trade, credit
          notes, HSN and the numbers issued. Give it to your CA: it is a statement of the month,
          not a filed return, and purchases are not in it (those come from your suppliers&apos;
          returns).
        </Text>
      </View>
    </ScrollView>
  );
}

/**
 * Build the month's return, write it beside the Excel exports and hand it to the
 * OS share sheet — the same route every other export takes, so it reaches the CA
 * over WhatsApp, Drive or mail with no server and no internet.
 *
 * A shop with no GSTIN is stopped here rather than handed a file: the utility
 * rejects a return without one, and finding that out at the CA's desk is worse
 * than finding it out now.
 */
async function shareGstr1(month: string): Promise<string> {
  const data = await gstr1Report(month);
  if (!data.gstin) {
    throw new Error(
      'This shop has no GSTIN saved. Add it under Settings → Business — a GSTR-1 without one is rejected.',
    );
  }
  const filename = gstr1Filename(data.gstin, data.fp);
  // A browser has no cache folder or share sheet: the return is downloaded.
  if (isWeb) {
    downloadFile(filename, JSON.stringify(data), 'application/json');
    return filename;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(data));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: filename,
      UTI: 'public.json',
    });
  }
  return file.uri;
}

/** 'YYYY-MM' shifted by whole months, staying in UTC so a timezone can't slip a day. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/** 'YYYY-MM' → 'Jul 2026', reusing the month names formatDate already knows. */
const monthLabel = (month: string): string => formatDate(`${month}-01`).replace(/^1 /, '');

/**
 * The 3B rows come out in rupees because that is what the table is written in;
 * the screen's formatter speaks paise, so they go back through the same door.
 */
const rupees = (value: number | undefined): string => formatMoney(Math.round((value ?? 0) * 100));

/** The whole tax on a 3B row, whichever heads it landed under. */
const taxOf = (row?: Gstr3bSummary['outward']): number =>
  row ? row.iamt + row.camt + row.samt + row.csamt : 0;

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

/**
 * The three heads, each shown only when there is something under it — a shop
 * that never sells out of state never sees an IGST row, and one that only ever
 * does never sees CGST/SGST.
 */
function TaxHeadLines({ totals }: { totals: TaxHeads }) {
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
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  blockTitle: { fontSize: 14, fontWeight: '700', color: '#555' },
  lineLabel: { fontSize: 15, color: '#666', flex: 1 },
  lineValue: { fontSize: 15, color: '#111' },
  lineStrong: { fontWeight: '700', color: '#111' },
  netCard: { backgroundColor: '#f4f8fe', borderRadius: 14, padding: 18, alignItems: 'center', gap: 4 },
  netLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  netValue: { fontSize: 28, fontWeight: '700' },
  netHint: { fontSize: 12, color: '#999' },
  disclaimer: { fontSize: 12, color: '#999', textAlign: 'center' },
  filing: {
    borderWidth: 1,
    borderColor: '#dce7f5',
    backgroundColor: '#fbfdff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#111' },
  step: {
    minWidth: 48,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dce7f5',
    backgroundColor: '#fff',
  },
  stepText: { fontSize: 22, color: '#208AEF', lineHeight: 26 },
  pressed: { opacity: 0.6 },
});
