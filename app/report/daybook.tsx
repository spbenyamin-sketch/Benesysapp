// One day, everything that happened. The screen a shop opens at closing time.

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ExcelExportButton from '@/components/ExcelExportButton';
import { dayBook, DAY_BOOK_LABEL, type DayBook, type DayBookKind } from '@/modules/reports/daybook';
import { exportDayBookExcel } from '@/modules/reports/excel';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { addDays, formatDate, formatMoney } from '@/utils/format';

const KIND_TONE: Record<DayBookKind, string> = {
  sale: '#208AEF',
  saleReturn: '#b8860b',
  purchase: '#6b4fbb',
  paymentIn: '#1a9d5a',
  paymentOut: '#c0392b',
  expense: '#e07b39',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function DayBookScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [day, setDay] = useState(todayISO);
  const [data, setData] = useState<DayBook | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      dayBook(day).then((d) => {
        if (active) setData(d);
      });
      return () => {
        active = false;
      };
    }, [day]),
  );

  const s = data?.summary;

  // "மொத்தம்" → what came in, what went out, what is left.
  useVoiceCommands((intent) => {
    if (intent.kind === 'total' && s) {
      return lang === 'ta-IN'
        ? `வந்தது ${formatMoney(s.cashIn)}, போனது ${formatMoney(s.cashOut)}, மீதம் ${formatMoney(s.netCash)}`
        : `In ${formatMoney(s.cashIn)}, out ${formatMoney(s.cashOut)}, net ${formatMoney(s.netCash)}`;
    }
    // "தேதி 2026-08-01" jumps the book to that day.
    if (intent.kind === 'setField' && intent.field === 'date') {
      setDay(intent.value);
      return true;
    }
    return false;
  });

  return (
    <FlatList
      style={styles.screen}
      data={data?.entries ?? []}
      keyExtractor={(e) => e.key}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          {/* One day at a time, with arrows — flicking back through the week is
              the commonest thing done here, and typing a date for it is work. */}
          <View style={styles.dayRow}>
            <Pressable style={styles.dayArrow} onPress={() => setDay((d) => addDays(d, -1))}>
              <Text style={styles.dayArrowText}>‹</Text>
            </Pressable>
            <TextInput
              style={styles.dayInput}
              value={day}
              onChangeText={setDay}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />
            <Pressable style={styles.dayArrow} onPress={() => setDay((d) => addDays(d, 1))}>
              <Text style={styles.dayArrowText}>›</Text>
            </Pressable>
          </View>
          <View style={styles.dayHead}>
            <Text style={styles.dayLabel}>{formatDate(day)}</Text>
            {day !== todayISO() ? (
              <Pressable hitSlop={8} onPress={() => setDay(todayISO())}>
                <Text style={styles.todayLink}>Today</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.cashCard}>
            <View style={styles.cashCell}>
              <Text style={styles.cashLabel}>Received</Text>
              <Text style={[styles.cashValue, { color: '#1a9d5a' }]}>
                {formatMoney(s?.cashIn ?? 0)}
              </Text>
            </View>
            <View style={styles.cashCell}>
              <Text style={styles.cashLabel}>Paid out</Text>
              <Text style={[styles.cashValue, { color: '#c0392b' }]}>
                {formatMoney(s?.cashOut ?? 0)}
              </Text>
            </View>
            <View style={styles.cashCell}>
              <Text style={styles.cashLabel}>Net cash</Text>
              <Text style={[styles.cashValue, styles.cashStrong]}>
                {formatMoney(s?.netCash ?? 0)}
              </Text>
            </View>
          </View>

          <View style={styles.billedRow}>
            <Billed label="Sales billed" value={s?.salesBilled ?? 0} />
            <Billed label="Purchases billed" value={s?.purchasesBilled ?? 0} />
            {s?.returnsBilled ? <Billed label="Returns" value={s.returnsBilled} /> : null}
            {s?.expenses ? <Billed label="Expenses" value={s.expenses} /> : null}
          </View>
          <Text style={styles.hint}>
            Billed figures include credit — only the cash row above is money that moved.
          </Text>

          <ExcelExportButton onExport={() => exportDayBookExcel(day)} />
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          disabled={!item.invoiceId && !item.partyId}
          onPress={() => {
            if (item.invoiceId) {
              router.push({ pathname: '/invoice/[id]', params: { id: item.invoiceId } });
            } else if (item.partyId) {
              router.push({ pathname: '/party/[id]', params: { id: item.partyId } });
            }
          }}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              <Text style={[styles.rowTag, { color: KIND_TONE[item.kind] }]}>
                {DAY_BOOK_LABEL[item.kind]}
              </Text>
              {'  '}
              {item.title}
            </Text>
            {item.sub ? (
              <Text style={styles.rowSub} numberOfLines={1}>
                {item.sub}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.rowAmount, { color: KIND_TONE[item.kind] }]}>
            {formatMoney(item.amount)}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Nothing happened on this day.</Text>}
    />
  );
}

function Billed({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.billed}>
      <Text style={styles.billedLabel}>{label}</Text>
      <Text style={styles.billedValue}>{formatMoney(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 32 },
  header: { padding: 16, gap: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayArrow: {
    width: 46,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cfe3fb',
    backgroundColor: '#eaf3fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayArrowText: { fontSize: 24, lineHeight: 28, fontWeight: '700', color: '#208AEF' },
  dayInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    textAlign: 'center',
    color: '#111',
    backgroundColor: '#fff',
  },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  todayLink: { fontSize: 13, fontWeight: '600', color: '#208AEF' },
  cashCard: {
    flexDirection: 'row',
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  cashCell: { flex: 1, gap: 3, alignItems: 'center' },
  cashLabel: { fontSize: 12, color: '#666' },
  cashValue: { fontSize: 16, fontWeight: '700' },
  cashStrong: { color: '#111' },
  billedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  billed: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  billedLabel: { fontSize: 12, color: '#888' },
  billedValue: { fontSize: 15, fontWeight: '600', color: '#111' },
  hint: { fontSize: 12, color: '#999' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowLeft: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: '#111', fontWeight: '500' },
  rowTag: { fontSize: 12, fontWeight: '700' },
  rowSub: { fontSize: 12, color: '#999' },
  rowAmount: { fontSize: 15, fontWeight: '700' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
