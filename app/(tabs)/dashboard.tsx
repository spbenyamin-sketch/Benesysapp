import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listInvoicesWithParty, type InvoiceWithParty } from '@/modules/invoices/service';
import { listPartiesWithBalance } from '@/modules/parties/ledger';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney } from '@/utils/format';

const TYPE_TAG: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  quotation: 'Quote',
  challan: 'Challan',
  saleReturn: 'Return',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [invoices, setInvoices] = useState<InvoiceWithParty[]>([]);
  const [receivable, setReceivable] = useState(0);
  const [payable, setPayable] = useState(0);
  const [todaySales, setTodaySales] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listInvoicesWithParty(8), listPartiesWithBalance()]).then(([inv, balances]) => {
        if (!active) return;
        setInvoices(inv);
        let recv = 0;
        let pay = 0;
        for (const b of balances) {
          if (b.balance > 0) recv += b.balance;
          else if (b.balance < 0) pay += -b.balance;
        }
        setReceivable(recv);
        setPayable(pay);
      });
      // Today's sales needs the full list; fetch once more (cheap, local DB).
      listInvoicesWithParty().then((all) => {
        if (!active) return;
        const today = todayISO();
        // Net of anything brought back today — "today's sales" should not count
        // goods that walked back in through the door.
        const sum = all
          .filter((i) => i.date === today)
          .reduce(
            (s, i) =>
              i.type === 'sale' ? s + i.grandTotal : i.type === 'saleReturn' ? s - i.grandTotal : s,
            0,
          );
        setTodaySales(sum);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // "மொத்தம்" on the dashboard reads out the day's takings; everything else here
  // (new sale, reports, tabs…) is a global navigation command.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total') return false;
    return lang === 'ta-IN'
      ? `இன்றைய விற்பனை ${formatMoney(todaySales)}, வசூலிக்க வேண்டியது ${formatMoney(receivable)}`
      : `Today's sales ${formatMoney(todaySales)}, to collect ${formatMoney(receivable)}`;
  });

  return (
    <FlatList
      style={styles.screen}
      data={invoices}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <View style={styles.actions}>
            <ActionButton
              label="+ New Sale"
              tone="#208AEF"
              onPress={() => router.push({ pathname: '/invoice/new', params: { type: 'sale' } })}
            />
            <ActionButton
              label="+ New Purchase"
              tone="#1a9d5a"
              onPress={() => router.push({ pathname: '/invoice/new', params: { type: 'purchase' } })}
            />
          </View>
          <View style={styles.actions}>
            <ActionButton
              label="Quotation"
              tone="#6c5ce7"
              small
              onPress={() => router.push({ pathname: '/invoice/new', params: { type: 'quotation' } })}
            />
            <ActionButton
              label="Challan"
              tone="#e17055"
              small
              onPress={() => router.push({ pathname: '/invoice/new', params: { type: 'challan' } })}
            />
          </View>

          <View style={styles.actions}>
            <ActionButton
              label="↓ Payment In"
              tone="#00897b"
              small
              onPress={() =>
                router.push({ pathname: '/payment/new', params: { direction: 'in' } })
              }
            />
            <ActionButton
              label="↑ Payment Out"
              tone="#c0392b"
              small
              onPress={() =>
                router.push({ pathname: '/payment/new', params: { direction: 'out' } })
              }
            />
          </View>

          <View style={styles.actions}>
            <ActionButton
              label="− Expense"
              tone="#8e44ad"
              small
              onPress={() => router.push('/expense/new')}
            />
            <ActionButton
              label="Expense List"
              tone="#636e72"
              small
              onPress={() => router.push('/expense')}
            />
          </View>

          <View style={styles.kpis}>
            <Kpi label="Today's sales" value={formatMoney(todaySales)} tone="#111" />
            <Kpi label="To collect" value={formatMoney(receivable)} tone="#1a9d5a" />
            <Kpi label="To pay" value={formatMoney(payable)} tone="#c0392b" />
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent</Text>
            <Pressable onPress={() => router.push('/invoice')} hitSlop={8}>
              <Text style={styles.seeAll}>All bills ›</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => (
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
          <Text style={styles.rowAmount}>{formatMoney(item.grandTotal)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No invoices yet.{'\n'}Tap “New Sale” to create your first.</Text>
      }
    />
  );
}

function ActionButton({
  label,
  tone,
  onPress,
  small,
}: {
  label: string;
  tone: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      style={[styles.actionBtn, { backgroundColor: tone }, small && styles.actionSmall]}
      onPress={onPress}
    >
      <Text style={[styles.actionText, small && styles.actionTextSmall]}>{label}</Text>
    </Pressable>
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
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 32 },
  headerWrap: { padding: 16, gap: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, minHeight: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionSmall: { minHeight: 42 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  actionTextSmall: { fontSize: 14, fontWeight: '600' },
  kpis: { flexDirection: 'row', gap: 10, marginTop: 4 },
  kpi: { flex: 1, backgroundColor: '#f7f7f9', borderRadius: 12, padding: 12, gap: 4 },
  kpiLabel: { fontSize: 12, color: '#888' },
  kpiValue: { fontSize: 16, fontWeight: '700' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#208AEF' },
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
  rowAmount: { fontSize: 15, fontWeight: '700', color: '#111' },
  empty: { color: '#999', textAlign: 'center', lineHeight: 22, padding: 32 },
});
