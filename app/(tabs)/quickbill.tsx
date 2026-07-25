import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listItems } from '@/modules/items/service';
import { createQuickBill, type QuickCartLine } from '@/modules/pos/service';
import { getDefaultTaxMode } from '@/modules/settings/service';
import { bestMatch, spokenNames } from '@/modules/voice/match';
import { addedLine, removedLine, setQtyLine, t, totalLine } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { computeTotals, TAX_MODE_LABEL, type TaxMode } from '@/utils/gst';
import { formatMoney } from '@/utils/format';
import type { Item } from '@/db/schema';

export default function QuickBillScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<number, number>>({}); // itemId → qty (units)
  const [cartOpen, setCartOpen] = useState(false);
  const [billing, setBilling] = useState(false);
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listItems(), getDefaultTaxMode()]).then(([rows, mode]) => {
        if (!active) return;
        setItems(rows);
        setTaxMode(mode);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // `by` may be negative (voice "remove 2 tea"); dropping to zero clears the line.
  const add = (id: number, by = 1) =>
    setCart((c) => {
      const next = (c[id] ?? 0) + by;
      const copy = { ...c };
      if (next <= 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  const dec = (id: number) => add(id, -1);
  const setQty = (id: number, qty: number) =>
    setCart((c) => {
      const copy = { ...c };
      if (qty <= 0) delete copy[id];
      else copy[id] = qty;
      return copy;
    });
  const drop = (id: number) =>
    setCart((c) => {
      const copy = { ...c };
      delete copy[id];
      return copy;
    });
  const clear = () => setCart({});

  const cartLines: QuickCartLine[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ item: itemById.get(Number(id)), qty }))
        .filter((l): l is QuickCartLine => !!l.item),
    [cart, itemById],
  );

  const totalQty = cartLines.reduce((s, l) => s + l.qty, 0);
  const { totals } = useMemo(
    () =>
      computeTotals(
        cartLines.map((l) => ({ qty: l.qty * 1000, rate: l.item.salePrice, taxRate: l.item.taxRate })),
        0,
        taxMode,
      ),
    [cartLines, taxMode],
  );

  const bill = useCallback(async () => {
    if (cartLines.length === 0) return false;
    setBilling(true);
    try {
      const detail = await createQuickBill(cartLines, 'cash', taxMode);
      clear();
      setCartOpen(false);
      router.push({ pathname: '/invoice/[id]', params: { id: detail.invoice.id } });
    } catch (e) {
      setBilling(false);
      Alert.alert('Could not bill', (e as Error)?.message ?? String(e));
      return false;
    }
    setBilling(false);
    return true;
  }, [cartLines, router, taxMode]);

  // ── Voice: the whole counter flow, hands-free ───────────────────────────────
  // "ரெண்டு டீ" → +2 tea · "டீ நீக்கு" → drop the line · "மொத்தம்" → speak the
  // total · "பில் போடு" → save. Item names are matched against each item's name
  // AND its Tamil voice alias (see modules/voice/match).
  const voiceHints = useMemo(() => items.flatMap((i) => spokenNames(i)), [items]);

  useVoiceCommands((intent) => {
    switch (intent.kind) {
      case 'addLine': {
        const hit = bestMatch(intent.itemQuery, items);
        if (!hit) return t('noMatch', lang);
        add(hit.value.id, Math.max(1, Math.round(intent.qty)));
        return addedLine(Math.max(1, Math.round(intent.qty)), hit.value.name, lang);
      }
      case 'removeLine': {
        const hit = bestMatch(intent.itemQuery, items);
        if (!hit) return t('noMatch', lang);
        if (intent.qty) add(hit.value.id, -Math.round(intent.qty));
        else drop(hit.value.id);
        return removedLine(hit.value.name, lang);
      }
      case 'setQty': {
        const hit = bestMatch(intent.itemQuery, items);
        if (!hit) return t('noMatch', lang);
        setQty(hit.value.id, Math.round(intent.qty));
        return setQtyLine(Math.round(intent.qty), hit.value.name, lang);
      }
      case 'search':
        setQuery(intent.query);
        return true;
      case 'clear':
        clear();
        setQuery('');
        return t('cleared', lang);
      case 'total':
        if (cartLines.length === 0) return t('cartEmpty', lang);
        setCartOpen(true);
        return totalLine(formatMoney(totals.grandTotal), lang);
      case 'setTaxMode':
        setTaxMode(intent.mode);
        return t(intent.mode === 'inclusive' ? 'taxIncl' : 'taxExcl', lang);
      case 'submit':
        if (cartLines.length === 0) return t('cartEmpty', lang);
        void bill();
        return t('billed', lang);
      default:
        return false;
    }
  }, voiceHints);

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search items — or tap 🎙 and say “ரெண்டு டீ”"
          placeholderTextColor="#999"
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <Pressable
          style={styles.taxChip}
          onPress={() => setTaxMode((m) => (m === 'inclusive' ? 'exclusive' : 'inclusive'))}
        >
          <Text style={styles.taxChipText}>
            {taxMode === 'inclusive' ? 'GST incl.' : 'GST extra'}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(it) => String(it.id)}
        numColumns={2}
        columnWrapperStyle={styles.rowWrap}
        contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.grid}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {items.length === 0
              ? 'No items yet.\nAdd items in the Items tab first.'
              : 'No matches.'}
          </Text>
        }
        renderItem={({ item }) => {
          const qty = cart[item.id] ?? 0;
          return (
            <Pressable style={[styles.tile, qty > 0 && styles.tileActive]} onPress={() => add(item.id)}>
              {qty > 0 ? (
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyBadgeText}>{qty}</Text>
                </View>
              ) : null}
              <Text style={styles.tileName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.tilePrice}>{formatMoney(item.salePrice)}</Text>
            </Pressable>
          );
        }}
      />

      {totalQty > 0 ? (
        <View style={styles.bar}>
          <Pressable style={styles.barInfo} onPress={() => setCartOpen(true)}>
            <Text style={styles.barCount}>{totalQty} item{totalQty > 1 ? 's' : ''} · view</Text>
            <Text style={styles.barTotal}>{formatMoney(totals.grandTotal)}</Text>
          </Pressable>
          <Pressable style={styles.barBtn} onPress={bill} disabled={billing}>
            {billing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.barBtnText}>Bill</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Modal visible={cartOpen} transparent animationType="slide" onRequestClose={() => setCartOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCartOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Cart</Text>
              <Pressable onPress={clear} hitSlop={8}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
            <FlatList
              data={cartLines}
              keyExtractor={(l) => String(l.item.id)}
              style={styles.cartList}
              renderItem={({ item: l }) => (
                <View style={styles.cartRow}>
                  <View style={styles.cartLeft}>
                    <Text style={styles.cartName} numberOfLines={1}>
                      {l.item.name}
                    </Text>
                    <Text style={styles.cartSub}>
                      {formatMoney(l.item.salePrice)} × {l.qty} = {formatMoney(l.item.salePrice * l.qty)}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepBtn} onPress={() => dec(l.item.id)}>
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepQty}>{l.qty}</Text>
                    <Pressable style={styles.stepBtn} onPress={() => add(l.item.id)}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
            <View style={styles.sheetTotals}>
              <Text style={styles.sheetSubtotal}>
                Subtotal {formatMoney(totals.subtotal)} · Tax {formatMoney(totals.taxTotal)}
                {'\n'}
                {TAX_MODE_LABEL[taxMode]}
              </Text>
              <Text style={styles.sheetGrand}>{formatMoney(totals.grandTotal)}</Text>
            </View>
            <Pressable style={styles.chargeBtn} onPress={bill} disabled={billing}>
              {billing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.chargeText}>Bill &amp; print — {formatMoney(totals.grandTotal)}</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const TILE_GAP = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  search: {
    flex: 1,
    backgroundColor: '#f2f2f4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  taxChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#208AEF',
  },
  taxChipText: { fontSize: 12, fontWeight: '700', color: '#208AEF' },
  grid: { padding: TILE_GAP, gap: TILE_GAP, paddingBottom: 96 },
  rowWrap: { gap: TILE_GAP },
  tile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
    padding: 12,
    justifyContent: 'space-between',
  },
  tileActive: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  tileName: { fontSize: 15, fontWeight: '600', color: '#111' },
  tilePrice: { fontSize: 14, color: '#208AEF', fontWeight: '700' },
  qtyBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#999', textAlign: 'center', lineHeight: 22 },
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    flexDirection: 'row',
    borderRadius: 14,
    backgroundColor: '#111',
    overflow: 'hidden',
    elevation: 6,
  },
  barInfo: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  barCount: { color: '#bbb', fontSize: 12 },
  barTotal: { color: '#fff', fontSize: 18, fontWeight: '700' },
  barBtn: { backgroundColor: '#208AEF', paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  barBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '80%', gap: 12 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  clearText: { color: '#c0392b', fontWeight: '600' },
  cartList: { flexGrow: 0 },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: 12,
  },
  cartLeft: { flexShrink: 1, gap: 3 },
  cartName: { fontSize: 15, fontWeight: '600', color: '#111' },
  cartSub: { fontSize: 13, color: '#888' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 20, color: '#111', lineHeight: 22 },
  stepQty: { fontSize: 16, fontWeight: '700', color: '#111', minWidth: 20, textAlign: 'center' },
  sheetTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    paddingTop: 12,
  },
  sheetSubtotal: { fontSize: 13, color: '#888', flexShrink: 1 },
  sheetGrand: { fontSize: 20, fontWeight: '700', color: '#111' },
  chargeBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
