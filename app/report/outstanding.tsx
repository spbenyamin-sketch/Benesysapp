import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import ExcelExportButton from '@/components/ExcelExportButton';
import { exportOutstandingExcel } from '@/modules/reports/excel';
import { partyOutstanding, type Outstanding } from '@/modules/reports/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatMoney } from '@/utils/format';
import type { PartyWithBalance } from '@/modules/parties/ledger';

type Section = { title: string; tone: string; total: number; rows: PartyWithBalance[] };

export default function OutstandingReportScreen() {
  const router = useRouter();
  const { lang } = useVoice();
  const [data, setData] = useState<Outstanding | null>(null);

  // "மொத்தம்" → how much is owed to you vs by you, spoken.
  useVoiceCommands((intent) => {
    if (intent.kind !== 'total' || !data) return false;
    return lang === 'ta-IN'
      ? `வசூலிக்க வேண்டியது ${formatMoney(data.totalReceivable)}, கொடுக்க வேண்டியது ${formatMoney(data.totalPayable)}`
      : `To collect ${formatMoney(data.totalReceivable)}, to pay ${formatMoney(data.totalPayable)}`;
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      partyOutstanding().then((d) => {
        if (active) setData(d);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const sections: Section[] = data
    ? [
        { title: 'To collect (receivables)', tone: '#1a9d5a', total: data.totalReceivable, rows: data.receivables },
        { title: 'To pay (payables)', tone: '#c0392b', total: data.totalPayable, rows: data.payables },
      ]
    : [];

  return (
    <FlatList
      style={styles.screen}
      data={sections}
      keyExtractor={(s) => s.title}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.exportWrap}>
          <ExcelExportButton onExport={exportOutstandingExcel} />
        </View>
      }
      renderItem={({ item: section }) => (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={[styles.sectionTotal, { color: section.tone }]}>
              {formatMoney(section.total)}
            </Text>
          </View>
          {section.rows.length === 0 ? (
            <Text style={styles.empty}>Nothing here.</Text>
          ) : (
            section.rows.map((r) => (
              <Pressable
                key={r.party.id}
                style={styles.row}
                onPress={() => router.push({ pathname: '/party/[id]', params: { id: r.party.id } })}
              >
                <Text style={styles.name}>{r.party.name}</Text>
                <Text style={[styles.amount, { color: section.tone }]}>
                  {formatMoney(Math.abs(r.balance))}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 20 },
  exportWrap: { marginBottom: 4 },
  section: { gap: 4 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  sectionTotal: { fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  name: { fontSize: 15, color: '#111', flex: 1 },
  amount: { fontSize: 15, fontWeight: '600' },
  empty: { color: '#999', paddingVertical: 8 },
});
