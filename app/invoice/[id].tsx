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
import { defaultDirectionForInvoice } from '@/modules/payments/service';
import { getSetting } from '@/modules/settings/service';
import { t, totalLine } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney, formatQty, formatTaxRate } from '@/utils/format';
import { splitTaxForStates } from '@/utils/gst';
import type { InvoiceType } from '@/utils/invoiceNumber';

const TYPE_LABEL: Record<InvoiceType, string> = {
  sale: 'Sale invoice',
  purchase: 'Purchase bill',
  quotation: 'Quotation',
  challan: 'Delivery challan',
  saleReturn: 'Sale return (credit note)',
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
  // The shop's own state, against which this bill's place of supply decides
  // whether the tax shown is CGST + SGST or IGST — the same call the PDF makes.
  const [bizState, setBizState] = useState<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getInvoiceWithItems(invoiceId), getSetting('business_state')]).then(
        ([d, state]) => {
          if (!active) return;
          setDetail(d);
          setBizState(state);
        },
      );
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

  // Voice: "பிரிண்ட்" / "ஷேர்" / "மொத்தம்" / "பணம் பெறு" (→ payment screen) /
  // "டெலிட்" (→ the delete confirmation).
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
      case 'navigate':
        // "ரிட்டர்ன்" on a sale opens the credit note already filled in.
        if (intent.target === 'newSaleReturn' && detail.invoice.type === 'sale') {
          router.push({
            pathname: '/invoice/new',
            params: { type: 'saleReturn', from: detail.invoice.id },
          });
          return lang === 'ta-IN' ? 'விற்பனை ரிட்டர்ன்' : 'Sale return';
        }
        if (intent.target !== 'newPayment') return false;
        router.push({
          pathname: '/payment/new',
          params: {
            partyId: detail.invoice.partyId,
            invoiceId: detail.invoice.id,
            direction: defaultDirectionForInvoice(detail.invoice.type),
          },
        });
        return lang === 'ta-IN' ? 'பணம் பதிவு' : 'Record payment';
      case 'action':
        if (intent.action === 'edit') {
          router.push({ pathname: '/invoice/edit/[id]', params: { id: detail.invoice.id } });
          return lang === 'ta-IN' ? 'திருத்தலாம்' : 'Editing';
        }
        if (intent.action !== 'delete') return false;
        confirmDelete();
        return true;
      default:
        return false;
    }
  });

  const confirmDelete = () => {
    if (!detail) return;
    const isStock = detail.invoice.type !== 'quotation' && detail.invoice.type !== 'challan';
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
  // Frozen on the bill when it was made; older bills fall back to wherever the
  // party lives today, exactly as the printed copy does.
  const placeOfSupply = invoice.placeOfSupply || party?.state || '';
  const tax = splitTaxForStates(invoice.taxTotal, bizState, placeOfSupply);
  const inRate = invoice.taxMode === 'inclusive' ? ' (in rate)' : '';

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
          {/* Only worth saying when it changes the tax: a local bill's place of
              supply is the shop's own state and tells the counter nothing. */}
          {tax.supply === 'inter' && placeOfSupply ? (
            <Text style={styles.date}>Place of supply: {placeOfSupply}</Text>
          ) : null}
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
                  {l.discount > 0 ? ` · less ${formatMoney(l.discount)}` : ''}
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
          {/* Nothing to split on a bill of exempt goods — a shop selling only
              untaxed items should not be shown two rows of zero. */}
          {invoice.taxTotal === 0 ? null : tax.supply === 'inter' ? (
            <TotalRow label={`IGST${inRate}`} value={formatMoney(tax.igst)} />
          ) : (
            <>
              <TotalRow label={`CGST${inRate}`} value={formatMoney(tax.cgst)} />
              <TotalRow label={`SGST${inRate}`} value={formatMoney(tax.sgst)} />
            </>
          )}
          {invoice.discount > 0 ? (
            <TotalRow label="Discount" value={`- ${formatMoney(invoice.discount)}`} />
          ) : null}
          {invoice.roundOff !== 0 ? (
            <TotalRow
              label="Round off"
              value={`${invoice.roundOff > 0 ? '+ ' : '- '}${formatMoney(Math.abs(invoice.roundOff))}`}
            />
          ) : null}
          <TotalRow label="Grand total" value={formatMoney(invoice.grandTotal)} strong />
        </View>

        {invoice.type !== 'quotation' && invoice.type !== 'challan' && invoice.paymentStatus !== 'paid' ? (
          <Button
            label="Record payment"
            tone="ghost"
            onPress={() =>
              router.push({
                pathname: '/payment/new',
                params: {
                  partyId: invoice.partyId,
                  invoiceId: invoice.id,
                  direction: defaultDirectionForInvoice(invoice.type),
                },
              })
            }
            style={styles.action}
          />
        ) : null}
        <Button
          label="Edit"
          tone="ghost"
          onPress={() =>
            router.push({ pathname: '/invoice/edit/[id]', params: { id: invoice.id } })
          }
          style={styles.action}
        />
        {invoice.type === 'sale' ? (
          <Button
            label="Sale return"
            tone="ghost"
            onPress={() =>
              router.push({
                pathname: '/invoice/new',
                params: { type: 'saleReturn', from: invoice.id },
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
  lineLeft: { flex: 1, gap: 3 },
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
