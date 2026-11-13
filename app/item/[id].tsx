import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import ItemPhoto from '@/components/ItemPhoto';
import { t } from '@/i18n';
import { deleteItemPhoto } from '@/modules/items/images';
import { deleteItem, getItem, listStockAdjustments } from '@/modules/items/service';
import { stockLevel, STOCK_LABEL, STOCK_TONE } from '@/modules/items/stockLevel';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney, formatQty, formatTaxRate } from '@/utils/format';
import type { Item, StockAdjustment } from '@/db/schema';

/** A stored UTC timestamp as the shop's own calendar day. */
function localDay(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);
  const router = useRouter();
  const { lang } = useVoice();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);

  // Voice: "மொத்தம்" reads stock + price · "எடிட்" opens the edit form ·
  // "ஸ்டாக் மாத்து" the adjust screen · "டெலிட்" removes the item.
  useVoiceCommands((intent) => {
    if (!item) return false;
    if (intent.kind === 'total') {
      return lang === 'ta-IN'
        ? `${item.name} இருப்பு ${formatQty(item.currentStock)} ${item.unit}, விலை ${formatMoney(item.salePrice)}`
        : `${item.name}: ${formatQty(item.currentStock)} ${item.unit} in stock at ${formatMoney(item.salePrice)}`;
    }
    if (intent.kind === 'setQty') {
      router.push({ pathname: '/item/adjust/[id]', params: { id: itemId } });
      return true;
    }
    if (intent.kind !== 'action') return false;
    switch (intent.action) {
      case 'edit':
        router.push({ pathname: '/item/edit/[id]', params: { id: itemId } });
        return true;
      case 'adjustStock':
        router.push({ pathname: '/item/adjust/[id]', params: { id: itemId } });
        return true;
      case 'delete':
        confirmDelete();
        return true;
      default:
        return false;
    }
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getItem(itemId).then((i) => {
        if (active) setItem(i ?? null);
      });
      listStockAdjustments(itemId, 10).then((rows) => {
        if (active) setAdjustments(rows);
      });
      return () => {
        active = false;
      };
    }, [itemId]),
  );

  const confirmDelete = () => {
    if (!item) return;
    Alert.alert(t('Delete item?'), t('"{name}" will be permanently removed.', { name: item.name }), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteItem(itemId);
            deleteItemPhoto(item.imageUri);
            router.back();
          } catch {
            Alert.alert(
              t('Cannot delete'),
              t('This item is used on one or more invoices. Remove those first.'),
            );
          }
        },
      },
    ]);
  };

  if (item === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('Item') }} />
        <Text style={styles.missing}>{t('Item not found.')}</Text>
      </View>
    );
  }

  const level = stockLevel(item);

  return (
    <>
      <Stack.Screen
        options={{
          title: item.name,
          headerRight: () => (
            <Pressable
              hitSlop={8}
              onPress={() => router.push({ pathname: '/item/edit/[id]', params: { id: itemId } })}
            >
              <Text style={styles.headerAction}>{t('Edit')}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.photoWrap}>
          <ItemPhoto uri={item.imageUri} name={item.name} size={140} />
        </View>

        <View style={styles.stockCard}>
          <Text style={styles.stockLabel}>{t('In stock')}</Text>
          <Text style={[styles.stockValue, level !== 'ok' && { color: STOCK_TONE[level] }]}>
            {formatQty(item.currentStock)} {item.unit}
          </Text>
          {level !== 'ok' ? (
            <Text style={[styles.stockWarn, { color: STOCK_TONE[level] }]}>
              {t(STOCK_LABEL[level])}
              {level === 'low'
                ? t(' — reorder at {qty} {unit}', { qty: formatQty(item.minStock), unit: item.unit })
                : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.details}>
          {item.category ? <Detail label={t('Category')} value={item.category} /> : null}
          {item.hsnCode ? <Detail label={t('HSN / SAC')} value={item.hsnCode} /> : null}
          <Detail label={t('Sale price')} value={formatMoney(item.salePrice)} />
          <Detail label={t('Purchase price')} value={formatMoney(item.purchasePrice)} />
          <Detail label={t('Tax rate')} value={formatTaxRate(item.taxRate)} />
          <Detail label={t('Unit')} value={item.unit} />
          <Detail label={t('Opening stock')} value={`${formatQty(item.openingStock)} ${item.unit}`} />
          {item.minStock > 0 ? (
            <Detail label={t('Alert at')} value={`${formatQty(item.minStock)} ${item.unit}`} />
          ) : null}
        </View>

        <Button
          label={t('Adjust stock')}
          tone="ghost"
          onPress={() => router.push({ pathname: '/item/adjust/[id]', params: { id: itemId } })}
        />

        {/* Only once a count has been corrected by hand — most items never are. */}
        {adjustments.length > 0 ? (
          <View style={styles.history}>
            <Text style={styles.historyTitle}>{t('Stock adjustments')}</Text>
            {adjustments.map((a) => (
              <View key={a.id} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyDate}>{formatDate(localDay(a.createdAt))}</Text>
                  {a.note ? <Text style={styles.historyNote}>{a.note}</Text> : null}
                </View>
                <View style={styles.historyRight}>
                  <Text style={[styles.historyDelta, { color: a.delta < 0 ? '#c0392b' : '#1e8e3e' }]}>
                    {a.delta > 0 ? '+' : '−'}
                    {formatQty(Math.abs(a.delta))} {item.unit}
                  </Text>
                  <Text style={styles.historyFromTo}>
                    {formatQty(a.oldStock)} → {formatQty(a.newStock)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
          <Text style={styles.deleteText}>{t('Delete item')}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
  headerAction: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
  container: { padding: 16, gap: 16 },
  photoWrap: { alignItems: 'center' },
  stockCard: {
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  stockLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  stockValue: { fontSize: 28, fontWeight: '700', color: '#111' },
  stockWarn: { fontSize: 12, color: '#c0392b', fontWeight: '600' },
  details: { gap: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  detailLabel: { color: '#888', fontSize: 14 },
  detailValue: { color: '#111', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  history: { gap: 10, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 14 },
  historyTitle: { fontSize: 13, color: '#666', fontWeight: '600' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  historyLeft: { flex: 1, gap: 2 },
  historyRight: { alignItems: 'flex-end', gap: 2 },
  historyDate: { fontSize: 14, color: '#111' },
  historyNote: { fontSize: 12, color: '#888' },
  historyDelta: { fontSize: 14, fontWeight: '700' },
  historyFromTo: { fontSize: 12, color: '#888' },
  deleteBtn: { marginTop: 8, alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
