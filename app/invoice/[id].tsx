import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import {
  deleteInvoiceWithItems,
  getInvoiceWithItems,
  type InvoiceDetail,
} from '@/modules/invoices/service';
import { printInvoice, shareInvoicePdf } from '@/modules/invoices/pdf';
import { t, totalLine } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney, formatQty, formatTaxRate } from '@/utils/format';
import type { InvoiceType } from '@/utils/invoiceNumber';

const TYPE_LABEL: Record<InvoiceType, string> = {
  sale: 'Sale invoice',
  purchase: 'Purchase bill',
  quotation: 'Quotation',
  challan: 'Delivery challan',
};

const STATUS_TONE: Record<string, string> = {
  paid: '#1a9d5a',
  partial: '#d68910',
  unpaid: '#c0392b',
};

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = Number(id);
  const router = useRouter();
  const { lang } = useVoice();
  const [detail, setDetail] = useState<InvoiceDetail | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getInvoiceWithItems(invoiceId).then((d) => {
        if (active) setDetail(d);
      });
      return () => {
        active = false;
      };
    }, [invoiceId]),
  );

  const share = async () => {
    if (!detail) return;
    setSharing(true);
    try {
      await shareInvoicePdf(detail);
    } catch (e) {
      Alert.alert('Could not share', (e as Error)?.message ?? String(e));
    } finally {
      setSharing(false);
    }
  };

  const print = async () => {
    if (!detail) return;
    setPrinting(true);
    try {
      await printInvoice(detail);
    } catch (e) {
      Alert.alert('Could not print', (e as Error)?.message ?? String(e));
    } finally {
      setPrinting(false);
    }
  };

  // Voice: "பிரிண்ட்" / "ஷேர்" / "மொத்தம்" / "பணம் பெறு" (→ payment screen).
  useVoiceCommands((intent) => {
    if (!detail) return false;
    switch (intent.kind) {
      case 'print':
        void print();
        return t('printing', lang);
      case 'share':
        void share();
        return t('sharing', lang);
      case 'total':
        return totalLine(formatMoney(detail.invoice.grandTotal), lang);
      default:
        return false;
    }
  });

  const confirmDelete = () => {
    if (!detail) return;
    const isStock = detail.invoice.type === 'sale' || detail.invoice.type === 'purchase';
    Alert.alert(
      'Delete this document?',
      `${detail.invoice.invoiceNo} will be permanently removed${isStock ? ' and its stock movement reversed' : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInvoiceWithItems(invoiceId);
              router.back();
            } catch (e) {
              Alert.alert('Could not delete', (e as Error)?.message ?? String(e));
            }
          },
        },
      ],
    );
  };

  if (detail === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (detail === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Invoice' }} />
        <Text style={styles.missing}>Invoice not found.</Text>
      </View>
    );
  }

  const { invoice, party, lines } = detail;
  const statusTone = STATUS_TONE[invoice.paymentStatus] ?? '#666';

  return (
    <>
      <Stack.Screen options={{ title: invoice.invoiceNo }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.typeLabel}>{TYPE_LABEL[invoice.type]}</Text>
            <View style={[styles.badge, { backgroundColor: statusTone }]}>
              <Text style={styles.badgeText}>{invoice.paymentStatus.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.invoiceNo}>{invoice.invoiceNo}</Text>
          <Text style={styles.date}>{formatDate(invoice.date)}</Text>
          {party ? (
            <Pressable
              onPress={() => router.push({ pathname: '/party/[id]', params: { id: party.id } })}
            >
              <Text style={styles.partyName}>{party.name} ›</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.table}>
          {lines.map((l) => (
            <View key={l.id} style={styles.lineRow}>
              <View style={styles.lineLeft}>
                <Text style={styles.lineName}>{l.itemName}</Text>
                <Text style={styles.lineMeta}>
                  {formatQty(l.qty)} {l.itemUnit} × {formatMoney(l.rate)}
                  {l.taxRate > 0 ? ` · ${formatTaxRate(l.taxRate)}` : ''}
                </Text>
              </View>
              <Text style={styles.lineAmount}>{formatMoney(l.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <TotalRow
            label={invoice.taxMode === 'inclusive' ? 'Taxable value' : 'Subtotal'}
            value={formatMoney(invoice.subtotal)}
          />
          <TotalRow
            label={invoice.taxMode === 'inclusive' ? 'Tax (included in rate)' : 'Tax'}
            value={formatMoney(invoice.taxTotal)}
          />
          {invoice.discount > 0 ? (
            <TotalRow label="Discount" value={`- ${formatMoney(invoice.discount)}`} />
          ) : null}
          <TotalRow label="Grand total" value={formatMoney(invoice.grandTotal)} strong />
        </View>

        {(invoice.type === 'sale' || invoice.type === 'purchase') && invoice.paymentStatus !== 'paid' ? (
          <Button
            label="Record payment"
            tone="ghost"
            onPress={() =>
              router.push({
                pathname: '/payment/new',
                params: { partyId: invoice.partyId, invoiceId: invoice.id },
              })
            }
            style={styles.action}
          />
        ) : null}
        <Button label={printing ? 'Opening…' : 'Print'} onPress={print} loading={printing} style={styles.action} />
        <Button
          label={sharing ? 'Preparing…' : 'Share PDF'}
          onPress={share}
          loading={sharing}
          tone="ghost"
          style={styles.action}
        />
        <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, strong && styles.totalStrong]}>{label}</Text>
      <Text style={[styles.totalValue, strong && styles.totalStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
  container: { padding: 16, gap: 16, paddingBottom: 40 },
  headerCard: { backgroundColor: '#f4f8fe', borderRadius: 14, padding: 18, gap: 4 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  invoiceNo: { fontSize: 22, fontWeight: '700', color: '#111' },
  date: { fontSize: 14, color: '#888' },
  partyName: { fontSize: 16, color: '#208AEF', fontWeight: '600', marginTop: 6 },
  table: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, overflow: 'hidden' },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  lineLeft: { flexShrink: 1, gap: 3 },
  lineName: { fontSize: 15, fontWeight: '600', color: '#111' },
  lineMeta: { fontSize: 13, color: '#888' },
  lineAmount: { fontSize: 15, fontWeight: '600', color: '#111' },
  totals: { gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, color: '#666' },
  totalValue: { fontSize: 15, color: '#111' },
  totalStrong: { fontSize: 18, fontWeight: '700', color: '#111' },
  action: { marginTop: 4 },
  deleteBtn: { alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
