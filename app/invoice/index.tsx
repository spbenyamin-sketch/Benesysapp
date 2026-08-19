import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateRange, { defaultRange } from '@/components/DateRange';
import { daysOverdue, isOverdue } from '@/modules/invoices/due';
import { listInvoicesWithParty, type InvoiceWithParty } from '@/modules/invoices/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';

type InvoiceType = InvoiceWithParty['type'];
type TypeFilter = 'all' | InvoiceType;

const FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'Sale' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'saleReturn', label: 'Sale ret.' },
  { key: 'purchaseReturn', label: 'Pur. ret.' },
  { key: 'quotation', label: 'Quotation' },
  { key: 'challan', label: 'Challan' },
];

const TYPE_TAG: Record<InvoiceType, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  quotation: 'Quote',
  challan: 'Challan',
  saleReturn: 'Sale return',
  purchaseReturn: 'Purchase return',
};

const STATUS_LABEL: Record<InvoiceWithParty['paymentStatus'], string> = {
  unpaid: 'Unpaid',
  partial: 'Partly paid',
  paid: 'Paid',
};

const STATUS_TONE: Record<InvoiceWithParty['paymentStatus'], string> = {
  unpaid: '#c0392b',
  partial: '#b8860b',
  paid: '#1a9d5a',
};

/** Quotations and challans move no money, so their "unpaid" is not a warning. */
function statusTone(row: InvoiceWithParty): string {
  if (row.type === 'quotation' || row.type === 'challan') return '#888';
  return STATUS_TONE[row.paymentStatus];
}

/** Goods walking back out of the deal count the other way in the net total. */
function signedTotal(row: InvoiceWithParty): number {
  return isReturnType(row.type) ? -row.grandTotal : row.grandTotal;
}

/** Either kind of return — a credit note to a customer, a debit note to a supplier. */
function isReturnType(type: InvoiceType): boolean {
  return type === 'saleReturn' || type === 'purchaseReturn';
}

export default function InvoiceListScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const init = defaultRange(new Date());
  const [rows, setRows] = useState<InvoiceWithParty[]>([]);
  const [type, setType] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const today = new Date().toISOString().slice(0, 10);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listInvoicesWithParty().then((r) => {
        if (active) setRows(r);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== 'all' && r.type !== type) return false;
      // Dates are ISO 'YYYY-MM-DD', so a plain string compare orders them right.
      // A half-typed box is treated as "no bound" rather than hiding everything.
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!q) return true;
      return r.invoiceNo.toLowerCase().includes(q) || r.partyName.toLowerCase().includes(q);
    });
  }, [rows, type, query, from, to]);

  const netTotal = useMemo(() => filtered.reduce((s, r) => s + signedTotal(r), 0), [filtered]);

  // Voice: "தேடு" fills the search box, "மொத்தம்" reads back what is on screen.
  useVoiceCommands((intent) => {
    if (intent.kind === 'search') {
      setQuery(intent.query);
      return lang === 'ta-IN' ? `${intent.query} தேடுறேன்` : `Searching ${intent.query}`;
    }
    if (intent.kind === 'clear') {
      setQuery('');
      setType('all');
      return true;
    }
    if (intent.kind === 'total') {
      return lang === 'ta-IN'
        ? `${filtered.length} பில், மொத்தம் ${formatMoney(netTotal)}`
        : `${filtered.length} documents, net total ${formatMoney(netTotal)}`;
    }
    return false;
  });

  return (
    <FlatList
      style={styles.screen}
      data={filtered}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search invoice no or party"
            placeholderTextColor="#999"
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <View style={styles.chips}>
            {FILTERS.map((f) => {
              const active = type === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setType(f.key)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Documents</Text>
              <Text style={styles.summaryValue}>{filtered.length}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Net total</Text>
              <Text
                style={[styles.summaryValue, styles.summaryStrong]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatMoney(netTotal)}
              </Text>
            </View>
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const isReturn = isReturnType(item.type);
        const late = isOverdue(item, today);
        return (
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: item.id } })}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowNo}>
                {item.invoiceNo} <Text style={styles.rowTag}>· {TYPE_TAG[item.type]}</Text>
              </Text>
              <Text style={styles.rowSub}>
                {item.partyName} · {formatDate(item.date)}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowAmount, isReturn && styles.rowAmountReturn]}>
                {isReturn ? '−' : ''}
                {formatMoney(item.grandTotal)}
              </Text>
              {/* A bill that has run past the day it was promised says so here
                  instead of just "Unpaid" — that is the row worth chasing. */}
              <Text style={[styles.rowStatus, { color: late ? '#c0392b' : statusTone(item) }]}>
                {late
                  ? `Overdue ${daysOverdue(item, today)}d`
                  : STATUS_LABEL[item.paymentStatus]}
              </Text>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {rows.length === 0
            ? 'No invoices yet.\nCreate one from the dashboard.'
            : 'No documents match this filter.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 32 },
  header: { padding: 16, gap: 12 },
  search: {
    backgroundColor: '#f2f2f4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  chipText: { fontWeight: '600', color: '#666', fontSize: 14 },
  chipTextActive: { color: '#fff' },
  summary: { flexDirection: 'row', gap: 10 },
  summaryCell: { flex: 1, backgroundColor: '#f7f7f9', borderRadius: 12, padding: 12, gap: 4 },
  summaryLabel: { fontSize: 12, color: '#888' },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#111' },
  summaryStrong: { color: '#208AEF', fontSize: 18 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 3 },
  rowNo: { fontSize: 15, fontWeight: '600', color: '#111' },
  rowTag: { fontSize: 13, color: '#888', fontWeight: '400' },
  rowSub: { fontSize: 13, color: '#888' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: '#111' },
  rowAmountReturn: { color: '#c0392b' },
  rowStatus: { fontSize: 11, fontWeight: '600' },
  empty: { color: '#999', textAlign: 'center', lineHeight: 22, padding: 32 },
});
