import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { deleteParty } from '@/modules/parties/service';
import { getPartyLedger, type LedgerEntry, type PartyLedger } from '@/modules/parties/ledger';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { balanceSummary, formatDate, formatMoney } from '@/utils/format';

export default function PartyLedgerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);
  const router = useRouter();
  const { lang } = useVoice();
  const [ledger, setLedger] = useState<PartyLedger | null | undefined>(undefined);

  // Voice: "மொத்தம்" reads the balance out · "பேமெண்ட்" opens the payment screen
  // already pointed at this party · "எடிட்" / "டெலிட்" the header buttons.
  useVoiceCommands((intent) => {
    if (!ledger) return false;
    if (intent.kind === 'total') {
      const { label } = balanceSummary(ledger.balance);
      return `${label} ${formatMoney(Math.abs(ledger.balance))}`;
    }
    if (intent.kind === 'navigate' && intent.target === 'newPayment') {
      router.push({ pathname: '/payment/new', params: { partyId } });
      return lang === 'ta-IN' ? 'பணம் பதிவு' : 'Record payment';
    }
    if (intent.kind === 'navigate' && intent.target === 'newSale') {
      router.push({ pathname: '/invoice/new', params: { type: 'sale', partyId } });
      return lang === 'ta-IN' ? 'புது விற்பனை' : 'New sale';
    }
    if (intent.kind !== 'action') return false;
    if (intent.action === 'edit') {
      router.push({ pathname: '/party/edit/[id]', params: { id: partyId } });
      return true;
    }
    if (intent.action === 'delete') {
      confirmDelete();
      return true;
    }
    return false;
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getPartyLedger(partyId).then((l) => {
        if (active) setLedger(l ?? null);
      });
      return () => {
        active = false;
      };
    }, [partyId]),
  );

  const confirmDelete = () => {
    if (!ledger) return;
    Alert.alert('Delete party?', `"${ledger.party.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteParty(partyId);
            router.back();
          } catch {
            Alert.alert(
              'Cannot delete',
              'This party has linked invoices or payments. Remove those first.',
            );
          }
        },
      },
    ]);
  };

  if (ledger === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (ledger === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Party' }} />
        <Text style={styles.missing}>Party not found.</Text>
      </View>
    );
  }

  const { party, entries, balance } = ledger;
  const summary = balanceSummary(balance);

  return (
    <>
      <Stack.Screen
        options={{
          title: party.name,
          headerRight: () => (
            <Pressable
              hitSlop={8}
              onPress={() => router.push({ pathname: '/party/edit/[id]', params: { id: partyId } })}
            >
              <Text style={styles.headerAction}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>{balance === 0 ? 'Settled' : summary.label}</Text>
              <Text style={[styles.balanceAmount, { color: summary.toneColor }]}>
                {formatMoney(Math.abs(balance))}
              </Text>
            </View>

            <Pressable
              style={styles.payBtn}
              onPress={() =>
                router.push({ pathname: '/payment/new', params: { partyId: partyId } })
              }
            >
              <Text style={styles.payBtnText}>+ Record payment</Text>
            </Pressable>

            <View style={styles.details}>
              <Detail label="Type" value={party.type === 'customer' ? 'Customer' : 'Supplier'} />
              {party.phone ? <Detail label="Phone" value={party.phone} /> : null}
              {party.gstin ? <Detail label="GSTIN" value={party.gstin} /> : null}
              {party.address ? <Detail label="Address" value={party.address} /> : null}
              {party.city ? <Detail label="City" value={party.city} /> : null}
              {party.state ? <Detail label="State" value={party.state} /> : null}
            </View>

            <Text style={styles.sectionTitle}>Ledger</Text>
          </View>
        }
        renderItem={({ item }) => <LedgerRow entry={item} />}
        ListFooterComponent={
          <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
            <Text style={styles.deleteText}>Delete party</Text>
          </Pressable>
        }
      />
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

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const positive = entry.delta > 0;
  const deltaColor = entry.delta === 0 ? '#888' : positive ? '#1a9d5a' : '#c0392b';
  const sign = entry.delta > 0 ? '+' : entry.delta < 0 ? '-' : '';
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryLeft}>
        <Text style={styles.entryLabel}>{entry.label}</Text>
        <Text style={styles.entryDate}>{formatDate(entry.date)}</Text>
      </View>
      <View style={styles.entryRight}>
        <Text style={[styles.entryDelta, { color: deltaColor }]}>
          {sign}
          {formatMoney(Math.abs(entry.delta))}
        </Text>
        <Text style={styles.entryBalance}>{formatMoney(entry.balance)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
  headerAction: { color: '#208AEF', fontSize: 16, fontWeight: '600' },
  listContent: { paddingBottom: 32 },
  header: { padding: 16, gap: 16 },
  balanceCard: {
    backgroundColor: '#f4f8fe',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  balanceAmount: { fontSize: 30, fontWeight: '700' },
  payBtn: {
    borderWidth: 1,
    borderColor: '#208AEF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  payBtnText: { color: '#208AEF', fontWeight: '600', fontSize: 15 },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  detailLabel: { color: '#888', fontSize: 14 },
  detailValue: { color: '#111', fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  entryLeft: { flexShrink: 1, gap: 2 },
  entryLabel: { fontSize: 15, color: '#111', fontWeight: '500' },
  entryDate: { fontSize: 12, color: '#999' },
  entryRight: { alignItems: 'flex-end', gap: 2 },
  entryDelta: { fontSize: 15, fontWeight: '600' },
  entryBalance: { fontSize: 12, color: '#999' },
  deleteBtn: { marginTop: 24, alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
