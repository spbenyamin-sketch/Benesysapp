import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  deleteExpense,
  filterExpensesByRange,
  listExpenses,
  summariseExpenses,
} from '@/modules/expenses/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney, formatTaxRate } from '@/utils/format';
import { financialYear } from '@/utils/invoiceNumber';
import type { Expense } from '@/db/schema';

type Period = 'month' | 'fy' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'fy', label: 'This FY' },
  { key: 'all', label: 'All' },
];

/** Inclusive ISO bounds for a period, anchored on today. */
function boundsFor(period: Period, now: Date): { from: string; to: string } {
  if (period === 'all') return { from: '0000-01-01', to: '9999-12-31' };
  if (period === 'fy') {
    const { start, end } = financialYear(now);
    return { from: start, to: end };
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [rows, setRows] = useState<Expense[]>([]);
  const [period, setPeriod] = useState<Period>('month');

  const load = useCallback(() => {
    let active = true;
    listExpenses().then((r) => {
      if (active) setRows(r);
    });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  const visible = useMemo(() => {
    const { from, to } = boundsFor(period, new Date());
    return filterExpensesByRange(rows, from, to);
  }, [rows, period]);

  const summary = useMemo(() => summariseExpenses(visible), [visible]);
  const topCategory = summary.byCategory[0];

  // Voice: "மொத்தம்" reads out what has been spent in the chosen period.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total') return false;
    return lang === 'ta-IN'
      ? `மொத்த செலவு ${formatMoney(summary.total)}`
      : `Total spent ${formatMoney(summary.total)}`;
  });

  const confirmDelete = (row: Expense) => {
    Alert.alert('Delete expense?', `${row.category} · ${formatMoney(row.amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExpense(row.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.kpis}>
          <Kpi label="Spent" value={formatMoney(summary.total)} tone="#c0392b" />
          <Kpi label="GST inside" value={formatMoney(summary.tax)} tone="#111" />
        </View>
        <View style={styles.chips}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setPeriod(p.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {topCategory ? (
          <Text style={styles.topLine}>
            Biggest: {topCategory.category} · {formatMoney(topCategory.total)}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={visible.length === 0 ? styles.emptyWrap : styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {rows.length === 0
              ? 'No expenses yet.\nTap + to record rent, power, wages…'
              : 'Nothing spent in this period.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/expense/edit/[id]', params: { id: item.id } })}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.name}>{item.category}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {formatDate(item.date)}
                {item.taxRate > 0 ? ` · ${formatTaxRate(item.taxRate)} GST` : ''}
                {item.notes ? ` · ${item.notes}` : ''}
              </Text>
            </View>
            <Text style={styles.amount}>−{formatMoney(item.amount)}</Text>
          </Pressable>
        )}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push('/expense/new')}
        accessibilityLabel="Add expense"
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
  topLine: { fontSize: 12, color: '#888' },
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
  amount: { fontSize: 15, fontWeight: '700', color: '#c0392b' },
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
