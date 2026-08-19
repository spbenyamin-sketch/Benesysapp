import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ExcelExportButton from '@/components/ExcelExportButton';
import { sendWhatsAppReminder } from '@/modules/parties/reminder';
import { exportAgingExcel } from '@/modules/reports/excel';
import { agingReport, AGING_BUCKETS, type AgingReport, type AgingRow } from '@/modules/reports/aging';
import { getSetting } from '@/modules/settings/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney } from '@/utils/format';

/** Older money is redder — the column a shopkeeper's eye should go to first. */
const BUCKET_TONE = ['#1a9d5a', '#b8860b', '#e07b39', '#c0392b'];

export default function AgingReportScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [data, setData] = useState<AgingReport | null>(null);
  const [businessName, setBusinessName] = useState('My Business');
  const [reminding, setReminding] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([agingReport(), getSetting('business_name')]).then(([d, name]) => {
        if (!active) return;
        setData(d);
        setBusinessName(name || 'My Business');
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // "மொத்தம்" → the total to collect, and how much of it has gone stale.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !data) return false;
    const old = data.buckets[2] + data.buckets[3];
    return lang === 'ta-IN'
      ? `வசூலிக்க வேண்டியது ${formatMoney(data.total)}, இதில் ${formatMoney(old)} அறுபது நாட்களுக்கு மேல்`
      : `To collect ${formatMoney(data.total)}, of which ${formatMoney(old)} is over 60 days old`;
  });

  const remind = async (row: AgingRow) => {
    setReminding(row.party.id);
    try {
      const result = await sendWhatsAppReminder(row.party, {
        balance: row.total,
        businessName,
        lang,
        oldestDays: row.oldestDays,
      });
      if (result === 'no-phone') {
        Alert.alert('No phone number', `Add a phone number for ${row.party.name} first.`);
      } else if (result === 'failed') {
        Alert.alert('Could not open WhatsApp', 'WhatsApp does not seem to be available here.');
      }
    } finally {
      setReminding(null);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      data={data?.rows ?? []}
      keyExtractor={(r) => String(r.party.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>To collect</Text>
            <Text style={styles.totalValue}>{formatMoney(data?.total ?? 0)}</Text>
            <Text style={styles.totalHint}>Aged from each bill's due date</Text>
          </View>

          <View style={styles.buckets}>
            {AGING_BUCKETS.map((b, i) => (
              <View key={b.key} style={styles.bucketCard}>
                <Text style={styles.bucketLabel}>{b.label}</Text>
                <Text style={[styles.bucketValue, { color: BUCKET_TONE[i] }]}>
                  {formatMoney(data?.buckets[i] ?? 0)}
                </Text>
              </View>
            ))}
          </View>

          <ExcelExportButton onExport={exportAgingExcel} />
          <Text style={styles.sectionTitle}>Who owes what</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Pressable
            style={styles.rowMain}
            onPress={() => router.push({ pathname: '/party/[id]', params: { id: item.party.id } })}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowName}>{item.party.name}</Text>
              <Text style={styles.rowAge}>
                {item.oldestDays > 0 ? `Oldest ${item.oldestDays} days` : 'Not due yet'}
                {item.party.phone ? '' : ' · no phone'}
              </Text>
            </View>
            <Text style={[styles.rowAmount, { color: BUCKET_TONE[oldestBucket(item)] }]}>
              {formatMoney(item.total)}
            </Text>
          </Pressable>
          {item.party.phone ? (
            <Pressable
              style={styles.remindBtn}
              onPress={() => remind(item)}
              disabled={reminding !== null}
            >
              <Text style={styles.remindText}>
                {reminding === item.party.id ? 'Opening…' : 'Remind'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {data === null ? '' : 'Nobody owes you anything right now.'}
        </Text>
      }
    />
  );
}

/** The oldest bucket this party has money sitting in — what colours the row. */
function oldestBucket(row: AgingRow): number {
  for (let i = row.buckets.length - 1; i >= 0; i -= 1) {
    if (row.buckets[i] > 0) return i;
  }
  return 0;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 32 },
  header: { padding: 16, gap: 14 },
  totalCard: { backgroundColor: '#f4f8fe', borderRadius: 14, padding: 18, alignItems: 'center', gap: 2 },
  totalLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  totalValue: { fontSize: 28, fontWeight: '700', color: '#111' },
  totalHint: { fontSize: 12, color: '#999' },
  buckets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bucketCard: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  bucketLabel: { fontSize: 12, color: '#888' },
  bucketValue: { fontSize: 17, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLeft: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, color: '#111', fontWeight: '500' },
  rowAge: { fontSize: 12, color: '#999' },
  rowAmount: { fontSize: 15, fontWeight: '700' },
  remindBtn: {
    borderWidth: 1,
    borderColor: '#25D366',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  remindText: { color: '#128C7E', fontWeight: '600', fontSize: 13 },
  empty: { color: '#999', textAlign: 'center', padding: 24 },
});
