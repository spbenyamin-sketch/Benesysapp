// The handover to the accountant: one file, imported into Tally as it is.
//
// A date range rather than the GST screen's month stepper — a return is filed
// for a calendar month, but a Tally handover is whatever period the accountant
// asked for, and at audit time that is a whole year.

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import DateRange, { defaultRange } from '@/components/DateRange';
import { tallyCounts } from '@/modules/tally/build';
import { shareTallyXml } from '@/modules/tally/share';
import { countLeftOut, loadTallyExport } from '@/modules/tally/service';
import type { TallyOptions, TallyPayload } from '@/modules/tally/types';
import { formatMoney } from '@/utils/format';

type Kind = keyof NonNullable<TallyOptions['kinds']>;

const KINDS: { key: Kind; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'returns', label: 'Returns' },
  { key: 'payments', label: 'Receipts & payments' },
  { key: 'expenses', label: 'Expenses' },
];

export default function TallyExportScreen() {
  const init = defaultRange(new Date());
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({
    sales: true,
    purchases: true,
    returns: true,
    payments: true,
    expenses: true,
  });
  const [masters, setMasters] = useState(true);
  const [payload, setPayload] = useState<TallyPayload | null>(null);
  const [leftOut, setLeftOut] = useState<{ count: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Loaded as the range changes, so the shop sees what it is about to send
  // before it sends it — and sees what is being left behind.
  useEffect(() => {
    let active = true;
    setPayload(null);
    Promise.all([loadTallyExport(from, to), countLeftOut(from, to)])
      .then(([data, left]) => {
        if (!active) return;
        setPayload(data);
        setLeftOut(left);
      })
      .catch(() => active && setPayload(null));
    return () => {
      active = false;
    };
  }, [from, to]);

  const options: TallyOptions = { masters, kinds };
  const counts = payload ? tallyCounts(payload, options) : null;

  const exportNow = () => {
    if (busy || !payload) return;
    if (!counts?.vouchers) {
      Alert.alert('Nothing to send', 'No entries in this range are marked as in the books.');
      return;
    }
    setBusy(true);
    shareTallyXml(payload, options)
      .catch((e: unknown) => Alert.alert('Export failed', (e as Error)?.message ?? String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What goes in the file</Text>
        <View style={styles.chips}>
          {KINDS.map(({ key, label }) => {
            const on = kinds[key];
            return (
              <Pressable
                key={key}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setKinds((k) => ({ ...k, [key]: !k[key] }))}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* A second import into a company that already has the ledgers wants
            the vouchers alone. */}
        <Pressable style={styles.masterRow} onPress={() => setMasters((m) => !m)}>
          <Text style={styles.masterBox}>{masters ? '☑' : '☐'}</Text>
          <Text style={styles.masterText}>
            Create the ledgers this file needs (parties, sales, GST, expense heads)
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>In this range</Text>
        {payload === null ? (
          <Text style={styles.subtle}>Reading the books…</Text>
        ) : (
          <>
            <Text style={styles.count}>
              {counts?.vouchers ?? 0} voucher(s){masters ? ` · ${counts?.ledgers ?? 0} ledger(s)` : ''}
            </Text>
            {leftOut?.count ? (
              <Text style={styles.leftOut}>
                {leftOut.count} entry(ies) worth {formatMoney(leftOut.total)} are marked
                “not in books” and stay out of this file.
              </Text>
            ) : null}
          </>
        )}
      </View>

      <Button
        label={busy ? 'Preparing…' : '⬇  Export Tally XML'}
        onPress={exportNow}
        loading={busy}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tell your accountant</Text>
        <Text style={styles.howto}>
          Open Tally → Gateway of Tally → Import → Vouchers → choose this file. The ledgers it
          needs are created on the way in. Import a period once.
        </Text>
        <Text style={styles.subtle}>
          Bills, credit and debit notes, receipts, payments and expenses that are marked in the
          books. Quotations and delivery challans are not accounting entries and are left out, and
          no opening balance is ever sent — your accountant’s own opening balances stay as they
          are. An expense is treated as local (CGST + SGST), because a bill for the shop’s own
          overheads carries no place of supply.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { backgroundColor: '#f7f7f9', borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  chipTextOn: { color: '#208AEF' },
  masterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  masterBox: { fontSize: 16, color: '#208AEF' },
  masterText: { flex: 1, fontSize: 13, color: '#444', lineHeight: 18 },
  count: { fontSize: 16, fontWeight: '600', color: '#111' },
  leftOut: { fontSize: 13, color: '#b8860b', lineHeight: 18 },
  subtle: { fontSize: 12, color: '#888', lineHeight: 17 },
  howto: { fontSize: 14, color: '#222', lineHeight: 20 },
});
