import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { listPartiesWithBalance, type PartyWithBalance } from '@/modules/parties/ledger';
import { bestMatch, spokenNames } from '@/modules/voice/match';
import { t } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { balanceSummary, formatMoney } from '@/utils/format';

export default function PartiesScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [rows, setRows] = useState<PartyWithBalance[]>([]);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listPartiesWithBalance().then((r) => {
        if (active) setRows(r);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ party }) =>
        party.name.toLowerCase().includes(q) || (party.phone ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Voice: say a name to open that party's ledger, "தேடு" to filter the list.
  const parties = useMemo(() => rows.map((r) => r.party), [rows]);
  const voiceHints = useMemo(() => parties.flatMap((p) => spokenNames(p)), [parties]);

  useVoiceCommands((intent) => {
    const open = (query_: string, threshold: number) => {
      const hit = bestMatch(query_, parties, threshold);
      if (!hit) return null;
      router.push({ pathname: '/party/[id]', params: { id: hit.value.id } });
      return true;
    };
    if (intent.kind === 'search') {
      setQuery(intent.query);
      open(intent.query, 0.85);
      return true;
    }
    if (intent.kind === 'selectParty' || intent.kind === 'addLine') {
      const q = intent.kind === 'selectParty' ? intent.query : intent.itemQuery;
      if (open(q, 0.8)) return true;
      setQuery(q);
      return t('noParty', lang);
    }
    if (intent.kind === 'clear') {
      setQuery('');
      return true;
    }
    return false;
  }, voiceHints);

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or phone"
          placeholderTextColor="#999"
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.party.id)}
        contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {rows.length === 0
              ? 'No parties yet.\nTap + to add your first party.'
              : 'No matches.'}
          </Text>
        }
        renderItem={({ item }) => {
          const { party, balance } = item;
          const summary = balanceSummary(balance);
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/party/[id]', params: { id: party.id } })}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.name}>{party.name}</Text>
                <Text style={styles.sub}>
                  {party.type === 'customer' ? 'Customer' : 'Supplier'}
                  {party.phone ? ` · ${party.phone}` : ''}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.amount, { color: summary.toneColor }]}>
                  {formatMoney(Math.abs(balance))}
                </Text>
                <Text style={styles.balLabel}>{balance === 0 ? 'Settled' : summary.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push('/party/new')}
        accessibilityLabel="Add party"
      >
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchWrap: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  search: {
    backgroundColor: '#f2f2f4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
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
  amount: { fontSize: 15, fontWeight: '600' },
  balLabel: { fontSize: 11, color: '#999' },
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
