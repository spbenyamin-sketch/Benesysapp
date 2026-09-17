import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  deletePayment,
  listPaymentsWithParty,
  paymentDirection,
  type PaymentWithParty,
} from '@/modules/payments/service';
import { NotInBooks } from '@/components/BooksToggle';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';

type Filter = 'all' | 'in' | 'out';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'In' },
  { key: 'out', label: 'Out' },
];

export default function PaymentsScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [rows, setRows] = useState<PaymentWithParty[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    let active = true;
    listPaymentsWithParty().then((r) => {
      if (active) setRows(r);
    });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => paymentDirection(r, r.partyType) === filter)),
    [rows, filter],
  );

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const r of rows) {
      if (paymentDirection(r, r.partyType) === 'in') inSum += r.amount;
      else outSum += r.amount;
    }
    return { inSum, outSum };
  }, [rows]);

  // Voice: "மொத்தம்" reads the in/out totals out loud.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total') return false;
    return lang === 'ta-IN'
      ? `வரவு ${formatMoney(totals.inSum)}, செலவு ${formatMoney(totals.outSum)}`
      : `Received ${formatMoney(totals.inSum)}, paid ${formatMoney(totals.outSum)}`;
  });

  const confirmDelete = (row: PaymentWithParty) => {
    Alert.alert(
      'Delete payment?',
      `${formatMoney(row.amount)} · ${row.partyName}. The invoice's paid status will be recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePayment(row.id);
            load();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.kpis}>
          <Kpi label="Received (in)" value={formatMoney(totals.inSum)} tone="#1a9d5a" />
          <Kpi label="Paid (out)" value={formatMoney(totals.outSum)} tone="#c0392b" />
        </View>
        <View style={styles.chips}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {rows.length === 0
              ? 'No payments yet.\nTap + to record one.'
              : 'No payments in this filter.'}
          </Text>
        }
        renderItem={({ item }) => {
          const dir = paymentDirection(item, item.partyType);
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/party/[id]', params: { id: item.partyId } })}
              onLongPress={() => confirmDelete(item)}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.name}>{item.partyName}</Text>
                <Text style={styles.sub}>
                  {formatDate(item.date)} · {item.mode.toUpperCase()}
                  {item.invoiceNo ? ` · ${item.invoiceNo}` : ' · On-account'}
                  {item.accounted ? null : <NotInBooks inline />}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.amount, { color: dir === 'in' ? '#1a9d5a' : '#c0392b' }]}>
                  {dir === 'in' ? '+' : '−'}
                  {formatMoney(item.amount)}
                </Text>
                <Text style={styles.dirLabel}>{dir === 'in' ? 'In' : 'Out'}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/payment/new',
            params: filter === 'all' ? {} : { direction: filter },
          })
        }
        accessibilityLabel="Record payment"
      >
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>
    </View>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    padding: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: '#f7f7f9', borderRadius: 12, padding: 12, gap: 4 },
  kpiLabel: { fontSize: 12, color: '#888' },
  kpiValue: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  chipText: { fontWeight: '600', color: '#666', fontSize: 14 },
  chipTextActive: { color: '#fff' },
  listContent: { paddingBottom: 96 },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#999', textAlign: 'center', lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '600', color: '#111' },
  sub: { fontSize: 13, color: '#888' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
  dirLabel: { fontSize: 11, color: '#999' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabPlus: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '400' },
});
