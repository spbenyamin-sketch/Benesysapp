import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateRange from '@/components/DateRange';
import { t } from '@/i18n';
import { deleteParty } from '@/modules/parties/service';
import {
  getPartyLedger,
  type LedgerEntry,
  type LedgerRange,
  type PartyLedger,
} from '@/modules/parties/ledger';
import { sendWhatsAppReminder } from '@/modules/parties/reminder';
import { sharePartyStatement } from '@/modules/parties/statement';
import { getSetting } from '@/modules/settings/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { balanceSummary, formatDate, formatMoney } from '@/utils/format';
import { financialYear } from '@/utils/invoiceNumber';

/** Only a whole date filters; a half-typed "2026-0" would hide everything. */
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function monthStart(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

type Period = 'month' | 'year' | 'all';

const PERIODS: { kind: Period; label: string }[] = [
  { kind: 'month', label: 'This month' },
  { kind: 'year', label: 'This year' },
  { kind: 'all', label: 'All' },
];

/** Which chip the typed dates happen to match, if any. */
function periodOf(from: string, to: string): Period | 'custom' {
  if (!from && !to) return 'all';
  const now = new Date();
  if (to !== now.toISOString().slice(0, 10)) return 'custom';
  if (from === monthStart(now)) return 'month';
  if (from === financialYear(now).start) return 'year';
  return 'custom';
}

export default function PartyLedgerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const partyId = Number(id);
  const router = useRouter();
  const { lang } = useVoice();
  const [ledger, setLedger] = useState<PartyLedger | null | undefined>(undefined);
  const [busy, setBusy] = useState<'remind' | 'statement' | null>(null);
  // Blank both ends = the whole account, which is what opening a party means.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = useMemo<LedgerRange | undefined>(() => {
    const picked = { from: isDay(from) ? from : '', to: isDay(to) ? to : '' };
    return picked.from || picked.to ? picked : undefined;
  }, [from, to]);

  const setPeriod = (kind: 'month' | 'year' | 'all') => {
    if (kind === 'all') {
      setFrom('');
      setTo('');
      return;
    }
    const now = new Date();
    setFrom(kind === 'month' ? monthStart(now) : financialYear(now).start);
    setTo(now.toISOString().slice(0, 10));
  };

  // Voice: "மொத்தம்" reads the balance out · "பேமெண்ட்" opens the payment screen
  // already pointed at this party · "எடிட்" / "டெலிட்" the header buttons.
  useVoiceCommands((intent) => {
    if (!ledger) return false;
    if (intent.kind === 'total') {
      const { label } = balanceSummary(ledger.outstanding);
      return `${label} ${formatMoney(Math.abs(ledger.outstanding))}`;
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
      getPartyLedger(partyId, range).then((l) => {
        if (active) setLedger(l ?? null);
      });
      return () => {
        active = false;
      };
    }, [partyId, range]),
  );

  /**
   * Open WhatsApp with the reminder already written. Nothing is sent from here —
   * the shopkeeper reads it and presses send, so no customer ever gets a message
   * the shop did not choose to write.
   */
  const remind = async () => {
    if (!ledger) return;
    setBusy('remind');
    try {
      const businessName = (await getSetting('business_name')) || 'My Business';
      const result = await sendWhatsAppReminder(ledger.party, {
        balance: ledger.outstanding,
        businessName,
        lang,
      });
      if (result === 'no-phone') {
        Alert.alert(t('No phone number'), t('Add a phone number for {name} first.', { name: ledger.party.name }));
      } else if (result === 'failed') {
        Alert.alert(t('Could not open WhatsApp'), t('WhatsApp does not seem to be available here.'));
      }
    } finally {
      setBusy(null);
    }
  };

  const sendStatement = async () => {
    if (!ledger) return;
    setBusy('statement');
    try {
      await sharePartyStatement(ledger);
    } catch (e) {
      Alert.alert(t('Could not make the statement'), (e as Error)?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () => {
    if (!ledger) return;
    Alert.alert(t('Delete party?'), t('"{name}" will be permanently removed.', { name: ledger.party.name }), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteParty(partyId);
            router.back();
          } catch {
            Alert.alert(
              t('Cannot delete'),
              t('This party has linked invoices or payments. Remove those first.'),
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
        <Stack.Screen options={{ title: t('Party') }} />
        <Text style={styles.missing}>{t('Party not found.')}</Text>
      </View>
    );
  }

  const { party, entries, balance, outstanding } = ledger;
  const summary = balanceSummary(outstanding);
  const activePeriod = periodOf(from, to);

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
              <Text style={styles.headerAction}>{t('Edit')}</Text>
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
              <Text style={styles.balanceLabel}>
                {t(outstanding === 0 ? 'Settled' : summary.label)}
              </Text>
              <Text style={[styles.balanceAmount, { color: summary.toneColor }]}>
                {formatMoney(Math.abs(outstanding))}
              </Text>
            </View>

            <Pressable
              style={styles.payBtn}
              onPress={() =>
                router.push({ pathname: '/payment/new', params: { partyId: partyId } })
              }
            >
              <Text style={styles.payBtnText}>{t('+ Record payment')}</Text>
            </Pressable>

            <View style={styles.actionRow}>
              {/* Only worth offering to someone who actually owes money. */}
              {outstanding > 0 ? (
                <Pressable
                  style={[styles.actionBtn, busy === 'remind' && styles.actionBusy]}
                  onPress={remind}
                  disabled={busy !== null}
                >
                  <Text style={styles.actionText}>{t('Remind on WhatsApp')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.actionBtn, busy === 'statement' && styles.actionBusy]}
                onPress={sendStatement}
                disabled={busy !== null}
              >
                <Text style={styles.actionText}>
                  {busy === 'statement' ? t('Preparing…') : t('Send statement')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.details}>
              <Detail label={t('Type')} value={party.type === 'customer' ? t('Customer') : t('Supplier')} />
              {party.phone ? <Detail label={t('Phone')} value={party.phone} /> : null}
              {party.gstin ? <Detail label="GSTIN" value={party.gstin} /> : null}
              {party.address ? <Detail label={t('Address')} value={party.address} /> : null}
              {party.city ? <Detail label={t('City')} value={party.city} /> : null}
              {party.state ? <Detail label={t('State')} value={party.state} /> : null}
            </View>

            <Text style={styles.sectionTitle}>{t('Ledger')}</Text>

            <View style={styles.period}>
              <View style={styles.periodRow}>
                {PERIODS.map((p) => (
                  <Pressable
                    key={p.kind}
                    style={[styles.chip, activePeriod === p.kind && styles.chipOn]}
                    onPress={() => setPeriod(p.kind)}
                  >
                    <Text style={[styles.chipText, activePeriod === p.kind && styles.chipTextOn]}>
                      {t(p.label)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
              {range ? (
                <Text style={styles.periodNote}>
                  {t('{from} — {to} · earlier entries are in the brought forward figure', {
                    from: range.from ? formatDate(range.from) : t('Start'),
                    to: range.to ? formatDate(range.to) : t('Today'),
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => <LedgerRow entry={item} />}
        ListFooterComponent={
          <>
            {/* With a period on screen the card above is today's figure, so the
                period's own closing has to be said somewhere. */}
            {range ? (
              <View style={styles.closingRow}>
                <Text style={styles.closingLabel}>
                  {t('Closing on {date}', { date: range.to ? formatDate(range.to) : t('today') })}
                </Text>
                <Text style={styles.closingValue}>{formatMoney(Math.abs(balance))}</Text>
              </View>
            ) : null}
            <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteText}>{t('Delete party')}</Text>
            </Pressable>
          </>
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

/** "Sale · INV-12": the kind is translated, the bill number and mode are data. */
function entryLabel(label: string): string {
  const [head, ...rest] = label.split(' · ');
  return [t(head), ...rest].join(' · ');
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const positive = entry.delta > 0;
  const deltaColor = entry.delta === 0 ? '#888' : positive ? '#1a9d5a' : '#c0392b';
  const sign = entry.delta > 0 ? '+' : entry.delta < 0 ? '-' : '';
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryLeft}>
        <Text style={styles.entryLabel}>{entryLabel(entry.label)}</Text>
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
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBusy: { opacity: 0.5 },
  actionText: { color: '#444', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  detailLabel: { color: '#888', fontSize: 14 },
  detailValue: { color: '#111', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  period: { gap: 10 },
  periodRow: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipOn: { borderColor: '#208AEF', backgroundColor: '#f4f8fe' },
  chipText: { color: '#555', fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#208AEF' },
  periodNote: { fontSize: 12, color: '#888', lineHeight: 17 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  entryLeft: { flex: 1, gap: 2 },
  entryLabel: { fontSize: 15, color: '#111', fontWeight: '500' },
  entryDate: { fontSize: 12, color: '#999' },
  entryRight: { alignItems: 'flex-end', gap: 2 },
  entryDelta: { fontSize: 15, fontWeight: '600' },
  entryBalance: { fontSize: 12, color: '#999' },
  closingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#111',
  },
  closingLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  closingValue: { fontSize: 16, fontWeight: '700', color: '#111' },
  deleteBtn: { marginTop: 24, alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
