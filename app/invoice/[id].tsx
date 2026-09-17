import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import {
  convertToInvoice,
  convertedFrom,
  deleteInvoiceWithItems,
  deletionImpact,
  getInvoice,
  getInvoiceWithItems,
  isConvertible,
  returnsAgainst,
  type InvoiceDetail,
} from '@/modules/invoices/service';
import { daysOverdue, isOverdue } from '@/modules/invoices/due';
import { printInvoice, shareInvoicePdf } from '@/modules/invoices/pdf';
import { partyDetailLines } from '@/modules/parties/describe';
import { defaultDirectionForInvoice } from '@/modules/payments/service';
import { getSetting } from '@/modules/settings/service';
import { t, totalLine } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney, formatQty, formatTaxRate } from '@/utils/format';
import { discountLabel, splitTaxForStates } from '@/utils/gst';
import type { InvoiceType } from '@/utils/invoiceNumber';
import type { Invoice } from '@/db/schema';

const TYPE_LABEL: Record<InvoiceType, string> = {
  sale: 'Sale invoice',
  purchase: 'Purchase bill',
  quotation: 'Quotation',
  challan: 'Delivery challan',
  saleReturn: 'Sale return (credit note)',
  purchaseReturn: 'Purchase return (debit note)',
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
  const [converting, setConverting] = useState(false);
  // The shop's own state, against which this bill's place of supply decides
  // whether the tax shown is CGST + SGST or IGST — the same call the PDF makes.
  const [bizState, setBizState] = useState<string | undefined>(undefined);
  // Credit notes already raised against this bill, and — on a credit note — the
  // bill it gives back. Both come from the same link, read in both directions.
  // That same link also joins a quotation to the sale it became, which is why
  // `source` is kept whole: its TYPE is what says which of the two it is.
  const [returns, setReturns] = useState<{ id: number; invoiceNo: string; grandTotal: number }[]>(
    [],
  );
  const [source, setSource] = useState<Invoice | null>(null);
  // On a quotation or challan: the bill it has already been turned into. Set
  // means the convert button is gone — a promise is only ever billed once.
  const [became, setBecame] = useState<Invoice | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        getInvoiceWithItems(invoiceId),
        getSetting('business_state'),
        returnsAgainst(invoiceId),
      ]).then(async ([d, state, back]) => {
        if (!active) return;
        setDetail(d);
        setBizState(state);
        setReturns(back);
        const from = d?.invoice.sourceInvoiceId;
        const original = from ? await getInvoice(from) : undefined;
        // Only a promise can have been turned into a bill — nothing else is
        // worth asking about.
        const billed =
          d && isConvertible(d.invoice.type) ? await convertedFrom(d.invoice.id) : undefined;
        if (active) {
          setSource(original ?? null);
          setBecame(billed ?? null);
        }
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

  /**
   * Turn this quotation/challan into a sale. Asked first, because unlike every
   * other button here it moves goods off the shelf — the shop should know that
   * before it happens, not find out from the stock report.
   */
  const confirmConvert = () => {
    if (!detail) return;
    const quote = detail.invoice.type === 'quotation';
    Alert.alert(
      lang === 'ta-IN' ? 'பில் ஆக்கலாமா?' : 'Convert to bill?',
      lang === 'ta-IN'
        ? `இந்த ${quote ? 'கோட்டேஷன்' : 'சலான்'}ல இருந்து புது விற்பனை பில் உருவாகும். ஸ்டாக் குறையும்.`
        : `A new sale bill will be created from this ${quote ? 'quotation' : 'challan'}. Stock will move.`,
      [
        { text: lang === 'ta-IN' ? 'வேண்டாம்' : 'Cancel', style: 'cancel' },
        { text: lang === 'ta-IN' ? 'பில் ஆக்கு' : 'Convert', onPress: () => void convert() },
      ],
    );
  };

  const convert = async () => {
    setConverting(true);
    try {
      const bill = await convertToInvoice(invoiceId);
      // Pushed, not replaced: the quotation stays behind in the stack, and it
      // now shows the bill it became.
      router.push({ pathname: '/invoice/[id]', params: { id: bill.id } });
    } catch (e) {
      Alert.alert('Could not convert', (e as Error)?.message ?? String(e));
    } finally {
      setConverting(false);
    }
  };

  // Voice: "பிரிண்ட்" / "ஷேர்" / "மொத்தம்" / "பணம் பெறு" (→ payment screen) /
  // "டெலிட்" (→ the delete confirmation) / "பில் போடு" on a quotation (→ the
  // convert confirmation).
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
      case 'submit':
        // "பில் போடு" — the word for making a bill. On a promise that is exactly
        // what convert does; on a real bill there is nothing left to submit.
        if (!isConvertible(detail.invoice.type) || became) return false;
        confirmConvert();
        return true;
      case 'navigate':
        // "ரிட்டர்ன்" opens the note that gives this document back — a credit
        // note on a sale, a debit note on a purchase.
        if (
          intent.target === 'newSaleReturn' &&
          (detail.invoice.type === 'sale' || detail.invoice.type === 'purchase')
        ) {
          const back = returnTypeFor(detail.invoice.type);
          router.push({
            pathname: '/invoice/new',
            params: { type: back, from: detail.invoice.id },
          });
          return back === 'purchaseReturn'
            ? lang === 'ta-IN'
              ? 'கொள்முதல் ரிட்டர்ன்'
              : 'Purchase return'
            : lang === 'ta-IN'
              ? 'விற்பனை ரிட்டர்ன்'
              : 'Sale return';
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

  const confirmDelete = async () => {
    if (!detail) return;
    const isStock = detail.invoice.type !== 'quotation' && detail.invoice.type !== 'challan';
    // A paid bill takes its receipt with it, and any credit note against it is
    // left without the bill it names. Say both before asking, not after.
    const impact = await deletionImpact(invoiceId);
    const extras: string[] = [];
    if (impact.paymentCount > 0) {
      extras.push(
        impact.paymentCount === 1
          ? `The ${formatMoney(impact.paymentTotal)} payment recorded on it will also be deleted.`
          : `${impact.paymentCount} payments totalling ${formatMoney(impact.paymentTotal)} recorded on it will also be deleted.`,
      );
    }
    if (impact.returnCount > 0) {
      extras.push(
        `${impact.returnCount} return note${impact.returnCount === 1 ? '' : 's'} raised against it will stay, but will no longer name this bill.`,
      );
    }
    Alert.alert(
      'Delete this document?',
      [
        `${detail.invoice.invoiceNo} will be permanently removed${isStock ? ' and its stock movement reversed' : ''}.`,
        ...extras,
      ].join('\n\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteInvoiceWithItems(invoiceId);
              router.back();
            } catch {
              // Nothing links to a bill any more once its payments go with it,
              // so anything landing here is a storage failure, not a rule the
              // shop broke. Raw SQLite text helps nobody standing at a counter.
              Alert.alert(
                'Could not delete',
                'The bill could not be removed. Please try again.',
              );
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
  const today = new Date().toISOString().slice(0, 10);
  const late = isOverdue(invoice, today);
  const returnedSum = returns.reduce((s, r) => s + r.grandTotal, 0);
  const fullyReturned = returnedSum >= invoice.grandTotal && invoice.grandTotal > 0;

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
          {invoice.dueDate ? (
            <Text style={[styles.date, late && styles.overdue]}>
              Due {formatDate(invoice.dueDate)}
              {late ? ` · ${daysOverdue(invoice, today)} days late` : ''}
            </Text>
          ) : null}
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
              {/* Their mobile, town and GST number — what anyone checking this
                  bill against the customer's copy looks for first. */}
              {partyDetailLines(party).map((line) => (
                <Text key={line} style={styles.partyDetail}>
                  {line}
                </Text>
              ))}
            </Pressable>
          ) : null}
          {/* A credit note names the bill it gives back, and a converted sale
              names the quotation it came from — the same link, so the two are
              one tap apart in either direction. Which wording is right is
              decided by the type of the document at the other end. */}
          {source ? (
            <Pressable
              onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: source.id } })}
            >
              <Text style={styles.linkLine}>
                {isConvertible(source.type) ? 'From' : 'Against'} {source.invoiceNo} ›
              </Text>
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
                  {l.discount > 0
                    ? ` · less ${formatMoney(l.discount)}${
                        l.discountPercent ? ` (${formatTaxRate(l.discountPercent)})` : ''
                      }`
                    : ''}
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
            <TotalRow
              label={discountLabel(invoice.discountPercent)}
              value={`- ${formatMoney(invoice.discount)}`}
            />
          ) : null}
          {invoice.roundOff !== 0 ? (
            <TotalRow
              label="Round off"
              value={`${invoice.roundOff > 0 ? '+ ' : '- '}${formatMoney(Math.abs(invoice.roundOff))}`}
            />
          ) : null}
          <TotalRow label="Grand total" value={formatMoney(invoice.grandTotal)} strong />
        </View>

        {returns.length ? (
          <View style={styles.returnsBlock}>
            <Text style={styles.returnsTitle}>
              Returned on this bill · {formatMoney(returnedSum)}
              {fullyReturned ? ' (all of it)' : ''}
            </Text>
            {returns.map((r) => (
              <Pressable
                key={r.id}
                style={styles.returnRow}
                onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: r.id } })}
              >
                <Text style={styles.returnNo}>{r.invoiceNo} ›</Text>
                <Text style={styles.returnAmount}>- {formatMoney(r.grandTotal)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* The whole point of a quotation: the customer said yes, so make it a
            bill instead of typing it all again. Once billed the button is gone
            and the bill is named in its place — the same goods must never leave
            the shelf twice. */}
        {isConvertible(invoice.type) ? (
          became ? (
            <Pressable
              style={styles.becameRow}
              onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: became.id } })}
            >
              <Text style={styles.linkLine}>
                {lang === 'ta-IN'
                  ? `${became.invoiceNo} பில் ஆயிடுச்சு ›`
                  : `Became bill ${became.invoiceNo} ›`}
              </Text>
            </Pressable>
          ) : (
            <Button
              label={lang === 'ta-IN' ? 'பில் ஆக்கு' : 'Convert to bill'}
              onPress={confirmConvert}
              loading={converting}
              style={styles.action}
            />
          )
        ) : null}
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
        {invoice.type === 'sale' || invoice.type === 'purchase' ? (
          <Button
            label={returnLabel(invoice.type, returnedSum, fullyReturned)}
            tone="ghost"
            onPress={() =>
              router.push({
                pathname: '/invoice/new',
                params: { type: returnTypeFor(invoice.type), from: invoice.id },
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

/** Goods go back to whoever they came from — the document type follows. */
function returnTypeFor(type: InvoiceType): InvoiceType {
  return type === 'purchase' ? 'purchaseReturn' : 'saleReturn';
}

function returnLabel(type: InvoiceType, returnedSum: number, fully: boolean): string {
  const noun = type === 'purchase' ? 'Purchase return' : 'Sale return';
  if (fully) return `${noun} (already fully returned)`;
  return returnedSum > 0 ? 'Return the rest' : noun;
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
  overdue: { color: '#c0392b', fontWeight: '600' },
  partyName: { fontSize: 16, color: '#208AEF', fontWeight: '600', marginTop: 6 },
  partyDetail: { fontSize: 12, color: '#888', lineHeight: 17 },
  linkLine: { fontSize: 13, color: '#208AEF', fontWeight: '600', marginTop: 4 },
  returnsBlock: { borderWidth: 1, borderColor: '#f0e0c0', backgroundColor: '#fdf9f0', borderRadius: 12, padding: 12, gap: 8 },
  returnsTitle: { fontSize: 13, fontWeight: '700', color: '#8a6d1f' },
  returnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  returnNo: { fontSize: 14, color: '#208AEF', fontWeight: '600' },
  returnAmount: { fontSize: 14, color: '#b8860b', fontWeight: '600' },
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
  becameRow: { alignItems: 'center', paddingVertical: 8 },
  deleteBtn: { alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
