import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ItemPhoto from '@/components/ItemPhoto';
import { listItems } from '@/modules/items/service';
import { bestMatch, spokenNames } from '@/modules/voice/match';
import { t } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney, formatQty, formatTaxRate } from '@/utils/format';
import type { Item } from '@/db/schema';

export default function ItemsScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listItems().then((rows) => {
        if (active) setItems(rows);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) || (it.voiceAlias ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  // Voice: "சர்க்கரை தேடு" filters the list; naming an item outright opens it;
  // "புது பொருள்" (a nav intent) is handled globally.
  const voiceHints = useMemo(() => items.flatMap((i) => spokenNames(i)), [items]);

  useVoiceCommands((intent) => {
    if (intent.kind === 'search') {
      setQuery(intent.query);
      const hit = bestMatch(intent.query, items, 0.85);
      if (hit) router.push({ pathname: '/item/[id]', params: { id: hit.value.id } });
      return true;
    }
    if (intent.kind === 'addLine') {
      const hit = bestMatch(intent.itemQuery, items, 0.8);
      if (hit) {
        router.push({ pathname: '/item/[id]', params: { id: hit.value.id } });
        return true;
      }
      setQuery(intent.itemQuery);
      return t('noMatch', lang);
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
          placeholder="Search items by name"
          placeholderTextColor="#999"
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {items.length === 0
              ? 'No items yet.\nTap + to add your first item.'
              : 'No matches.'}
          </Text>
        }
        renderItem={({ item }) => {
          const lowStock = item.currentStock <= 0;
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
            >
              <ItemPhoto uri={item.imageUri} name={item.name} size={46} />
              <View style={styles.rowLeft}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>
                  {formatMoney(item.salePrice)}
                  {item.taxRate > 0 ? ` · ${formatTaxRate(item.taxRate)} GST` : ''}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.stock, lowStock && styles.stockLow]}>
                  {formatQty(item.currentStock)} {item.unit}
                </Text>
                <Text style={styles.stockLabel}>{lowStock ? 'Out of stock' : 'in stock'}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push('/item/new')}
        accessibilityLabel="Add item"
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
  stock: { fontSize: 15, fontWeight: '600', color: '#111' },
  stockLow: { color: '#c0392b' },
  stockLabel: { fontSize: 11, color: '#999' },
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
