// One account's cash book: every rupee in and out, with the balance after each.

import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ExcelExportButton from '@/components/ExcelExportButton';
import {
  accountBook,
  type AccountBook,
  type AccountEntry,
  type AccountEntryKind,
} from '@/modules/bankAccounts/ledger';
import { exportCashBookExcel } from '@/modules/reports/excel';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';

const KIND_LABEL: Record<AccountEntryKind, string> = {
  opening: 'Opening',
  paymentIn: 'Received',
  paymentOut: 'Paid',
  expense: 'Expense',
};

export default function AccountBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // "unassigned" is the money recorded before it had an account to belong to.
  const accountId = id === 'unassigned' ? null : Number(id);
  const router = useRouter();
  const { lang } = useVoice();
  const [book, setBook] = useState<AccountBook | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      accountBook(accountId).then((b) => {
        if (active) setBook(b ?? null);
      });
      return () => {
        active = false;
      };
    }, [accountId]),
  );

  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !book) return false;
    return lang === 'ta-IN'
      ? `இருப்பு ${formatMoney(book.balance)}`
      : `Balance ${formatMoney(book.balance)}`;
  });

  if (book === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (book === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Account' }} />
        <Text style={styles.missing}>Account not found.</Text>
      </View>
    );
  }

  const title = book.account?.name ?? 'Not assigned';
  const inTotal = book.entries.reduce((s, e) => s + (e.delta > 0 ? e.delta : 0), 0);
  const outTotal = book.entries.reduce((s, e) => s + (e.delta < 0 ? -e.delta : 0), 0);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            book.account ? (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  router.push({ pathname: '/account/edit/[id]', params: { id: book.account!.id } })
                }
              >
                <Text style={styles.headerAction}>Edit</Text>
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        style={styles.screen}
        data={book.entries}
        keyExtractor={(e) => e.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={[styles.balanceValue, book.balance < 0 && styles.negative]}>
                {formatMoney(book.balance)}
              </Text>
            </View>
            <View style={styles.flowRow}>
              <Flow label="In" value={inTotal} tone="#1a9d5a" />
              <Flow label="Out" value={outTotal} tone="#c0392b" />
            </View>
            {book.account ? null : (
              <Text style={styles.note}>
                These were recorded before this shop had accounts, or without one being picked. Open
                each and set an account to move it out of here.
              </Text>
            )}
            <ExcelExportButton onExport={() => exportCashBookExcel(accountId)} />
            <Text style={styles.sectionTitle}>Cash book</Text>
          </View>
        }
        renderItem={({ item }) => <BookRow entry={item} />}
        ListEmptyComponent={<Text style={styles.empty}>Nothing has moved through this yet.</Text>}
      />
    </>
  );
}

function Flow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.flow}>
      <Text style={styles.flowLabel}>{label}</Text>
      <Text style={[styles.flowValue, { color: tone }]}>{formatMoney(value)}</Text>
    </View>
  );
}

function BookRow({ entry }: { entry: AccountEntry }) {
  const tone = entry.delta > 0 ? '#1a9d5a' : entry.delta < 0 ? '#c0392b' : '#888';
  const sign = entry.delta > 0 ? '+' : entry.delta < 0 ? '-' : '';
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          <Text style={styles.rowKind}>{KIND_LABEL[entry.kind]}</Text>
          {'  '}
          {entry.label}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {entry.sub} · {formatDate(entry.date)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowDelta, { color: tone }]}>
          {sign}
          {formatMoney(Math.abs(entry.delta))}
        </Text>
        <Text style={styles.rowBalance}>{formatMoney(entry.balance)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
  headerAction: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
  content: { paddingBottom: 32 },
  header: { padding: 16, gap: 14 },
  balanceCard: {
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  balanceValue: { fontSize: 28, fontWeight: '700', color: '#111' },
  negative: { color: '#c0392b' },
  flowRow: { flexDirection: 'row', gap: 10 },
  flow: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    gap: 3,
    alignItems: 'center',
  },
  flowLabel: { fontSize: 12, color: '#888' },
  flowValue: { fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, color: '#999', lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowLeft: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, color: '#111', fontWeight: '500' },
  rowKind: { fontSize: 12, color: '#999', fontWeight: '700' },
  rowSub: { fontSize: 12, color: '#999' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowDelta: { fontSize: 15, fontWeight: '600' },
  rowBalance: { fontSize: 12, color: '#999' },
  empty: { color: '#999', textAlign: 'center', padding: 32 },
});
