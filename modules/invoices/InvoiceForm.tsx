import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from '@/components/Button';
import PickerField, { type PickerOption } from '@/components/PickerField';
import { createInvoiceWithItems, type InvoiceLineInput } from '@/modules/invoices/service';
import { listItems } from '@/modules/items/service';
import { listParties } from '@/modules/parties/service';
import { getDefaultTaxMode } from '@/modules/settings/service';
import { bestMatch, spokenNames } from '@/modules/voice/match';
import { addedLine, removedLine, t, totalLine } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { computeTotals, TAX_MODE_LABEL, type TaxMode } from '@/utils/gst';
import {
  formatMoney,
  formatTaxRate,
  parseQtyToThousandths,
  parseRupeesToPaise,
} from '@/utils/format';
import type { InvoiceType } from '@/utils/invoiceNumber';
import type { Item, Party } from '@/db/schema';

const TITLES: Record<InvoiceType, { noun: string; cta: string }> = {
  sale: { noun: 'Sale invoice', cta: 'Create sale' },
  purchase: { noun: 'Purchase bill', cta: 'Create purchase' },
  quotation: { noun: 'Quotation', cta: 'Create quotation' },
  challan: { noun: 'Delivery challan', cta: 'Create challan' },
};

// One row in the editable line-items list. qty/rate are kept as strings while
// editing and parsed to integers (thousandths / paise) on the fly.
interface LineDraft {
  key: string;
  itemId: number;
  itemName: string;
  unit: string;
  taxRate: number; // basis points
  qtyStr: string;
  rateStr: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoiceForm({
  type,
  initialPartyId,
}: {
  type: InvoiceType;
  initialPartyId?: number;
}) {
  const router = useRouter();
  const { lang } = useVoice();
  const titles = TITLES[type];
  const isPurchase = type === 'purchase';

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [partyId, setPartyId] = useState<number | null>(initialPartyId ?? null);
  const [date, setDate] = useState(todayISO());
  const [discountStr, setDiscountStr] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [lineSeq, setLineSeq] = useState(0);
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listParties(), listItems(), getDefaultTaxMode()]).then(([p, i, mode]) => {
        if (!active) return;
        setParties(p);
        setItems(i);
        setTaxMode(mode);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const partyOptions: PickerOption[] = useMemo(
    () =>
      parties.map((p) => ({
        id: p.id,
        label: p.name,
        sublabel: p.type === 'customer' ? 'Customer' : 'Supplier',
      })),
    [parties],
  );

  const itemOptions: PickerOption[] = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        label: it.name,
        sublabel: `${formatMoney(isPurchase ? it.purchasePrice : it.salePrice)} · ${it.unit}`,
      })),
    [items, isPurchase],
  );

  /**
   * Add an item, or bump the quantity if it's already on the invoice. Voice
   * passes an explicit qty (and sometimes a rate); tapping the picker adds one.
   */
  const addLine = (itemId: number, qty = 1, rate?: number) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === itemId);
      if (existing) {
        const nextQty = (parseQtyToThousandths(existing.qtyStr) + Math.round(qty * 1000)) / 1000;
        return prev.map((l) =>
          l.key === existing.key
            ? { ...l, qtyStr: String(nextQty), rateStr: rate != null ? String(rate) : l.rateStr }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: `l${lineSeq}`,
          itemId: it.id,
          itemName: it.name,
          unit: it.unit,
          taxRate: it.taxRate,
          qtyStr: String(qty),
          rateStr: String(rate ?? (isPurchase ? it.purchasePrice : it.salePrice) / 100),
        },
      ];
    });
    setLineSeq((n) => n + 1);
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  // Live totals from the current drafts.
  const parsedLines: InvoiceLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        itemId: l.itemId,
        qty: parseQtyToThousandths(l.qtyStr),
        rate: parseRupeesToPaise(l.rateStr),
        taxRate: l.taxRate,
      })),
    [lines],
  );
  const discount = parseRupeesToPaise(discountStr);
  const { lines: computed, totals } = useMemo(
    () => computeTotals(parsedLines, discount, taxMode),
    [parsedLines, discount, taxMode],
  );

  const save = async () => {
    if (!partyId) {
      Alert.alert('Party required', `Select a ${isPurchase ? 'supplier' : 'customer'} first.`);
      return;
    }
    if (parsedLines.length === 0) {
      Alert.alert('No items', 'Add at least one item to the invoice.');
      return;
    }
    if (parsedLines.some((l) => l.qty <= 0)) {
      Alert.alert('Check quantities', 'Every line needs a quantity greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const inv = await createInvoiceWithItems(
        { type, partyId, date, discount, paymentStatus: 'unpaid', taxMode },
        parsedLines,
      );
      router.replace({ pathname: '/invoice/[id]', params: { id: inv.id } });
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  // ── Voice: dictate a whole invoice ─────────────────────────────────────────
  // "ராஜேஷ் கஸ்டமர்" picks the party, "ரெண்டு டீ" adds a line, "தள்ளுபடி ஐம்பது"
  // sets the discount, "வரி உள்ளே" flips to inclusive GST, "சேமி" saves.
  const voiceHints = useMemo(
    () => [...items.flatMap((i) => spokenNames(i)), ...parties.flatMap((p) => spokenNames(p))],
    [items, parties],
  );

  useVoiceCommands((intent) => {
    switch (intent.kind) {
      case 'selectParty': {
        const hit = bestMatch(intent.query, parties);
        if (!hit) return t('noParty', lang);
        setPartyId(hit.value.id);
        return hit.value.name;
      }
      case 'addLine': {
        const hit = bestMatch(intent.itemQuery, items);
        if (!hit) {
          // Not an item — on an invoice, an unrecognised name is usually the party.
          const party = bestMatch(intent.itemQuery, parties, 0.75);
          if (party) {
            setPartyId(party.value.id);
            return party.value.name;
          }
          return t('noMatch', lang);
        }
        const qty = Math.max(1, intent.qty);
        addLine(hit.value.id, qty, intent.rate);
        return addedLine(qty, hit.value.name, lang);
      }
      case 'removeLine': {
        const hit = bestMatch(intent.itemQuery, items);
        if (!hit) return t('noMatch', lang);
        const line = lines.find((l) => l.itemId === hit.value.id);
        if (!line) return t('noMatch', lang);
        removeLine(line.key);
        return removedLine(hit.value.name, lang);
      }
      case 'setQty': {
        const hit = bestMatch(intent.itemQuery, items);
        const line = hit ? lines.find((l) => l.itemId === hit.value.id) : undefined;
        if (!line) return t('noMatch', lang);
        updateLine(line.key, { qtyStr: String(intent.qty) });
        return true;
      }
      case 'setField':
        if (intent.field === 'discount') {
          setDiscountStr(intent.value);
          return true;
        }
        if (intent.field === 'date') {
          setDate(intent.value);
          return true;
        }
        return false;
      case 'setTaxMode':
        setTaxMode(intent.mode);
        return t(intent.mode === 'inclusive' ? 'taxIncl' : 'taxExcl', lang);
      case 'total':
        return totalLine(formatMoney(totals.grandTotal), lang);
      case 'clear':
        setLines([]);
        setDiscountStr('');
        return t('cleared', lang);
      case 'action':
        // Nothing on this screen can be edited or deleted as a record — a bare
        // "delete" means "throw away what I have typed so far".
        if (intent.action !== 'delete') return false;
        setLines([]);
        setDiscountStr('');
        return t('cleared', lang);
      case 'submit':
        void save();
        return true;
      default:
        return false;
    }
  }, voiceHints);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PickerField
          label={isPurchase ? 'Supplier' : 'Customer'}
          value={partyId}
          onSelect={setPartyId}
          options={partyOptions}
          placeholder={`Select ${isPurchase ? 'supplier' : 'customer'}`}
          required
          emptyText="No parties yet — add one from the Parties tab."
        />

        <View style={styles.field}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.dateInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
          />
        </View>

        <Text style={styles.sectionTitle}>Items</Text>
        {lines.map((l, i) => (
          <View key={l.key} style={styles.lineCard}>
            <View style={styles.lineHeader}>
              <Text style={styles.lineName} numberOfLines={1}>
                {l.itemName}
                {l.taxRate > 0 ? <Text style={styles.lineTax}>  {formatTaxRate(l.taxRate)}</Text> : null}
              </Text>
              <Pressable hitSlop={8} onPress={() => removeLine(l.key)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.lineInputs}>
              <View style={styles.lineCol}>
                <Text style={styles.miniLabel}>Qty ({l.unit})</Text>
                <TextInput
                  style={styles.miniInput}
                  value={l.qtyStr}
                  onChangeText={(v) => updateLine(l.key, { qtyStr: v })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
              </View>
              <View style={styles.lineCol}>
                <Text style={styles.miniLabel}>Rate (₹)</Text>
                <TextInput
                  style={styles.miniInput}
                  value={l.rateStr}
                  onChangeText={(v) => updateLine(l.key, { rateStr: v })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
              </View>
              <View style={styles.lineAmount}>
                <Text style={styles.miniLabel}>Amount</Text>
                <Text style={styles.amountVal}>{formatMoney(computed[i]?.amount ?? 0)}</Text>
              </View>
            </View>
          </View>
        ))}

        <PickerField
          label="Add item"
          value={null}
          onSelect={addLine}
          options={itemOptions}
          placeholder="Tap to add an item"
          emptyText="No items yet — add one from the Items tab."
        />

        <View style={styles.field}>
          <Text style={styles.label}>Discount (₹)</Text>
          <TextInput
            style={styles.dateInput}
            value={discountStr}
            onChangeText={setDiscountStr}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#aaa"
          />
        </View>

        <View style={styles.taxModeRow}>
          {(['exclusive', 'inclusive'] as TaxMode[]).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.taxModeBtn, taxMode === mode && styles.taxModeOn]}
              onPress={() => setTaxMode(mode)}
            >
              <Text style={[styles.taxModeText, taxMode === mode && styles.taxModeTextOn]}>
                {TAX_MODE_LABEL[mode]}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.totals}>
          <TotalRow label={taxMode === 'inclusive' ? 'Taxable value' : 'Subtotal'} value={formatMoney(totals.subtotal)} />
          <TotalRow label="Tax" value={formatMoney(totals.taxTotal)} />
          {totals.discount > 0 ? (
            <TotalRow label="Discount" value={`- ${formatMoney(totals.discount)}`} />
          ) : null}
          <TotalRow label="Grand total" value={formatMoney(totals.grandTotal)} strong />
        </View>

        <Button label={titles.cta} onPress={save} loading={saving} style={styles.save} />
        <Text style={styles.hint}>
          {type === 'sale'
            ? 'Stock decreases when you save. Record payment from the invoice screen.'
            : isPurchase
              ? 'Stock increases when you save. Record payment from the invoice screen.'
              : 'Quotations and challans don’t affect stock or ledgers.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#444' },
  dateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4 },
  lineCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, gap: 10, backgroundColor: '#fafafa' },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lineName: { fontSize: 15, fontWeight: '600', color: '#111', flexShrink: 1 },
  lineTax: { fontSize: 12, color: '#888', fontWeight: '400' },
  remove: { fontSize: 16, color: '#c0392b', paddingHorizontal: 4 },
  lineInputs: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  lineCol: { flex: 1, gap: 4 },
  lineAmount: { flex: 1, gap: 4, alignItems: 'flex-end' },
  miniLabel: { fontSize: 11, color: '#888' },
  miniInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
  amountVal: { fontSize: 15, fontWeight: '600', color: '#111', paddingVertical: 8 },
  taxModeRow: { flexDirection: 'row', gap: 10 },
  taxModeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  taxModeOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  taxModeText: { fontSize: 13, fontWeight: '600', color: '#666', textAlign: 'center' },
  taxModeTextOn: { color: '#208AEF' },
  totals: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd', paddingTop: 12, gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 15, color: '#666' },
  totalValue: { fontSize: 15, color: '#111' },
  totalStrong: { fontSize: 18, fontWeight: '700', color: '#111' },
  save: { marginTop: 8 },
  hint: { fontSize: 12, color: '#888', textAlign: 'center' },
});
