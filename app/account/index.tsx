// Cash & Bank: what the shop is holding, and where.

import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { accountBalances, type AccountBalances } from '@/modules/bankAccounts/ledger';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney } from '@/utils/format';

type Row =
  | { key: string; kind: 'account'; id: number; name: string; sub: string; balance: number }
  | { key: string; kind: 'unassigned'; balance: number; count: number };

function toRows(data: AccountBalances | null): Row[] {
  if (!data) return [];
  const rows: Row[] = data.accounts.map((a) => ({
    key: `acc-${a.account.id}`,
    kind: 'account',
    id: a.account.id,
    name: a.account.name,
    sub: a.account.type === 'cash' ? 'Cash' : 'Bank',
    balance: a.balance,
  }));
  // Only shown when there is something in it — a shop that always names an
  // account never learns this row exists.
  if (data.unassignedCount > 0) {
    rows.push({
      key: 'unassigned',
      kind: 'unassigned',
      balance: data.unassigned,
      count: data.unassignedCount,
    });
  }
  return rows;
}

export default function AccountsScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [data, setData] = useState<AccountBalances | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      accountBalances().then((d) => {
        if (active) setData(d);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !data) return false;
    return lang === 'ta-IN'
      ? `கையிருப்பு ${formatMoney(data.total)}`
      : `Cash and bank in hand ${formatMoney(data.total)}`;
  });

  const rows = toRows(data);

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>In hand</Text>
              <Text style={styles.totalValue}>{formatMoney(data?.total ?? 0)}</Text>
              <Text style={styles.totalHint}>Opening balances plus everything that moved</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: '/account/[id]',
                params: { id: item.kind === 'account' ? item.id : 'unassigned' },
              })
            }
          >
            <View style={styles.rowLeft}>
              <Text style={styles.name}>
                {item.kind === 'account' ? item.name : 'Not assigned'}
              </Text>
              <Text style={styles.sub}>
                {item.kind === 'account'
                  ? item.sub
                  : `${item.count} entr${item.count === 1 ? 'y' : 'ies'} with no account named`}
              </Text>
            </View>
            <Text style={[styles.balance, item.balance < 0 && styles.negative]}>
              {formatMoney(item.balance)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No accounts yet.{'\n'}Add your cash drawer and any bank account, and every payment can
            say where the money went.
          </Text>
        }
      />

      <Pressable style={styles.fab} onPress={() => router.push('/account/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 96 },
  header: { padding: 16 },
  totalCard: {
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 2,
  },
  totalLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  totalValue: { fontSize: 28, fontWeight: '700', color: '#111' },
  totalHint: { fontSize: 12, color: '#999', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowLeft: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  sub: { fontSize: 13, color: '#888' },
  balance: { fontSize: 16, fontWeight: '700', color: '#111' },
  negative: { color: '#c0392b' },
  empty: { color: '#999', textAlign: 'center', padding: 32, lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '600' },
});
