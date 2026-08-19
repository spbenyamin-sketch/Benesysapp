import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  createInvoiceWithItems,
  getInvoiceWithItems,
  updateInvoiceWithItems,
  type InvoiceLineInput,
} from '@/modules/invoices/service';
import { netPaidForInvoice } from '@/modules/payments/service';
import { listItems } from '@/modules/items/service';
import { listParties } from '@/modules/parties/service';
import { getDefaultTaxMode, getSetting } from '@/modules/settings/service';
import { bestMatch, spokenNames } from '@/modules/voice/match';
import { addedLine, removedLine, t, totalLine } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { computeTotals, supplyType, TAX_MODE_LABEL, type TaxMode } from '@/utils/gst';
import {
  addDays,
  formatMoney,
  formatTaxRate,
  paiseToRupeeInput,
  parseQtyToThousandths,
  parseRupeesToPaise,
  qtyToInput,
} from '@/utils/format';
import {
  formatQtyValue,
  isFractionalUnit,
  presetLabel,
  qtyPresets,
  stepQty,
} from '@/utils/units';
import type { InvoiceType } from '@/utils/invoiceNumber';
import type { Item, Party } from '@/db/schema';

const TITLES: Record<InvoiceType, { noun: string; cta: string }> = {
  sale: { noun: 'Sale invoice', cta: 'Create sale' },
  purchase: { noun: 'Purchase bill', cta: 'Create purchase' },
  quotation: { noun: 'Quotation', cta: 'Create quotation' },
  challan: { noun: 'Delivery challan', cta: 'Create challan' },
  saleReturn: { noun: 'Sale return', cta: 'Create sale return' },
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
  /** Money off this line alone, rupees as typed. Empty on almost every line —
   *  the boxes only appear once the shopkeeper asks for them. */
  discountStr: string;
  /** Carried over from the invoice being returned, so the profit report unwinds
   *  exactly what that sale earned rather than today's cost. */
  costPrice?: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Credit terms a counter actually says out loud. Days from the bill's own date,
// so moving the bill date moves the presets with it.
const DUE_PRESETS = [0, 7, 15, 30];
const duePresetLabel = (days: number) => (days === 0 ? 'Today' : `${days} days`);
/** What "Add due date" starts at — a month's credit, the commonest term. */
const DEFAULT_DUE_DAYS = 30;

/** Ask before leaving the shop owing the customer money. */
function confirmOverpaid(paid: number, newTotal: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Already paid more than this',
      `${formatMoney(paid)} has been received against this bill, but the new total is ${formatMoney(
        newTotal,
      )}. ${formatMoney(paid - newTotal)} will show as owed back to them.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Save anyway', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export default function InvoiceForm({
  type,
  initialPartyId,
  sourceInvoiceId,
  editInvoiceId,
}: {
  type: InvoiceType;
  initialPartyId?: number;
  /** Invoice this document is being raised against — a sale being returned. Its
   *  party, lines, rates, tax basis and costs are copied in to start from. */
  sourceInvoiceId?: number;
  /** Set when correcting a document that is already saved: the same form, but
   *  it writes back over that document instead of creating another one. */
  editInvoiceId?: number;
}) {
  const router = useRouter();
  const { lang } = useVoice();
  const titles = TITLES[type];
  const isPurchase = type === 'purchase';
  const isReturn = type === 'saleReturn';
  const isEdit = editInvoiceId != null;
  // Both flows start by reading an existing document; only the destination of
  // the save differs.
  const prefillId = editInvoiceId ?? sourceInvoiceId;

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [partyId, setPartyId] = useState<number | null>(initialPartyId ?? null);
  const [date, setDate] = useState(todayISO());
  // '' = no due date, which is what every bill meant before this existed: due
  // on the day it was made.
  const [dueDate, setDueDate] = useState('');
  const [showDue, setShowDue] = useState(false);
  const [discountStr, setDiscountStr] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [lineSeq, setLineSeq] = useState(0);
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');
  // Per-line discount boxes stay hidden until asked for: most bills never give
  // one, and an extra box on every row is exactly the clutter this app avoids.
  const [showLineDiscount, setShowLineDiscount] = useState(false);
  // The shop's own state — half of the CGST+SGST vs IGST decision.
  const [bizState, setBizState] = useState<string | undefined>(undefined);
  // Where the document being returned was supplied to. A credit note has to
  // carry the tax of the bill it reverses, even if the customer has since moved.
  const [sourcePlace, setSourcePlace] = useState<string | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        listParties(),
        listItems(),
        getDefaultTaxMode(),
        getSetting('business_state'),
      ]).then(([p, i, mode, state]) => {
        if (!active) return;
        setParties(p);
        setItems(i);
        setBizState(state);
        // A document raised against (or being) another one inherits ITS tax
        // basis — see the prefill below — so the app-wide default must not
        // overwrite it.
        if (!prefillId) setTaxMode(mode);
      });
      return () => {
        active = false;
      };
    }, [prefillId]),
  );

  // Returning goods, or correcting a saved bill: either way, start from the
  // document itself. Everything stays editable, so a partial return is a matter
  // of changing quantities or deleting rows.
  useEffect(() => {
    if (!prefillId) return;
    let active = true;
    getInvoiceWithItems(prefillId).then((source) => {
      if (!active || !source) return;
      setPartyId(source.invoice.partyId);
      setTaxMode(source.invoice.taxMode);
      if (isEdit) {
        setDate(source.invoice.date);
        // Correcting a bill must not quietly drop the credit it was given.
        if (source.invoice.dueDate) {
          setDueDate(source.invoice.dueDate);
          setShowDue(true);
        }
      } else setSourcePlace(source.invoice.placeOfSupply);
      setDiscountStr(source.invoice.discount ? paiseToRupeeInput(source.invoice.discount) : '');
      setLines(
        source.lines.map((l, i) => ({
          key: `src${i}`,
          itemId: l.itemId,
          itemName: l.itemName,
          unit: l.itemUnit,
          taxRate: l.taxRate,
          qtyStr: qtyToInput(l.qty),
          rateStr: paiseToRupeeInput(l.rate),
          discountStr: l.discount ? paiseToRupeeInput(l.discount) : '',
          costPrice: l.costPrice ?? undefined,
        })),
      );
      // A bill that already carries line discounts opens with them on show —
      // otherwise correcting one would silently drop it.
      if (source.lines.some((l) => l.discount > 0)) setShowLineDiscount(true);
      setLineSeq(source.lines.length);
    });
    return () => {
      active = false;
    };
  }, [sourceInvoiceId]);

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
          discountStr: '',
        },
      ];
    });
    setLineSeq((n) => n + 1);
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /**
   * One tap of +/− on a line. The step follows the item's unit: pieces move by
   * 1, kg/ltr by a quarter, grams by 50 (see utils/units).
   */
  const bumpQty = (key: string, direction: 1 | -1) =>
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              qtyStr: formatQtyValue(
                stepQty(parseQtyToThousandths(l.qtyStr) / 1000, l.unit, direction),
              ),
            }
          : l,
      ),
    );

  const setLineQty = (key: string, qty: number) =>
    updateLine(key, { qtyStr: formatQtyValue(qty) });

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  // Live totals from the current drafts.
  const parsedLines: InvoiceLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        itemId: l.itemId,
        qty: parseQtyToThousandths(l.qtyStr),
        rate: parseRupeesToPaise(l.rateStr),
        taxRate: l.taxRate,
        // A hidden box is a box that was never filled in: turning the row of
        // discounts off takes them off the bill too, so what is on screen is
        // always what gets saved.
        discount: showLineDiscount ? parseRupeesToPaise(l.discountStr) : 0,
        costPrice: l.costPrice,
      })),
    [lines, showLineDiscount],
  );
  const discount = parseRupeesToPaise(discountStr);
  const { lines: computed, totals } = useMemo(
    () => computeTotals(parsedLines, discount, taxMode),
    [parsedLines, discount, taxMode],
  );

  // Which pair of taxes this bill attracts, worked out rather than asked for:
  // the shop's state against the customer's. Nothing to fill in — the totals
  // just name the right tax, and the printed bill follows.
  const party = useMemo(() => parties.find((p) => p.id === partyId), [parties, partyId]);
  const supply = supplyType(bizState, party?.state);
  const taxLabel =
    supply === 'inter' ? 'IGST' : taxMode === 'inclusive' ? 'CGST + SGST (in rate)' : 'CGST + SGST';

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
    // Cutting a bill below what the customer has already handed over is allowed
    // — it happens whenever an over-charge is found — but it must never be a
    // surprise, so the money that has to go back is named before saving.
    if (isEdit) {
      const paid = await netPaidForInvoice(editInvoiceId);
      if (paid > totals.grandTotal) {
        const proceed = await confirmOverpaid(paid, totals.grandTotal);
        if (!proceed) return;
      }
    }

    setSaving(true);
    try {
      // '' means no credit term at all, which the column stores as NULL.
      const due = showDue ? dueDate.trim() || null : null;
      const inv = isEdit
        ? await updateInvoiceWithItems(
            editInvoiceId,
            { partyId, date, discount, taxMode, dueDate: due },
            parsedLines,
          )
        : await createInvoiceWithItems(
            {
              type,
              partyId,
              date,
              discount,
              paymentStatus: 'unpaid',
              taxMode,
              dueDate: due,
              // A credit note is taxed where the sale it reverses was taxed.
              placeOfSupply: sourcePlace,
            },
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
        // Fractions are real quantities here — "அரை கிலோ சர்க்கரை" is 0.5 kg,
        // not 1. Only a zero/negative reading falls back to a single unit.
        const qty = intent.qty > 0 ? intent.qty : 1;
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
          <View style={styles.sectionRow}>
            <Text style={styles.label}>Date</Text>
            {/* Only a bill that money is owed on can fall due. */}
            {type === 'sale' || type === 'purchase' ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setShowDue((on) => {
                    if (on) setDueDate('');
                    else if (!dueDate) setDueDate(addDays(date, DEFAULT_DUE_DAYS));
                    return !on;
                  });
                }}
              >
                <Text style={styles.toggleLink}>{showDue ? 'No due date' : 'Add due date'}</Text>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            style={styles.dateInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#aaa"
          />
        </View>

        {showDue ? (
          <View style={styles.field}>
            <Text style={styles.label}>Due date</Text>
            <TextInput
              style={styles.dateInput}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#aaa"
            />
            <View style={styles.presetRow}>
              {DUE_PRESETS.map((days) => {
                const value = addDays(date, days);
                const on = dueDate === value;
                return (
                  <Pressable
                    key={days}
                    style={[styles.preset, on && styles.presetOn]}
                    onPress={() => setDueDate(value)}
                  >
                    <Text style={[styles.presetText, on && styles.presetTextOn]}>
                      {duePresetLabel(days)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Items</Text>
          {lines.length > 0 ? (
            <Pressable onPress={() => setShowLineDiscount((v) => !v)} hitSlop={8}>
              <Text style={styles.toggleLink}>
                {showLineDiscount ? 'Hide item discount' : 'Discount per item'}
              </Text>
            </Pressable>
          ) : null}
        </View>
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
            {/* Qty gets its own row: a big −/+ stepper that knows the unit, so
                pieces move by 1 and kg/ltr by a quarter. The box stays typable
                for anything in between (1.2 kg). */}
            <View style={styles.qtyBlock}>
              <Text style={styles.miniLabel}>
                Qty ({l.unit})
                {isFractionalUnit(l.unit) ? (
                  <Text style={styles.miniHint}>  · decimals ok</Text>
                ) : null}
              </Text>
              <View style={styles.qtyRow}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() => bumpQty(l.key, -1)}
                  hitSlop={4}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <TextInput
                  style={styles.qtyInput}
                  value={l.qtyStr}
                  onChangeText={(v) => updateLine(l.key, { qtyStr: v })}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
                <Pressable style={styles.qtyBtn} onPress={() => bumpQty(l.key, 1)} hitSlop={4}>
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.presetRow}>
                {qtyPresets(l.unit).map((p) => {
                  const on = parseQtyToThousandths(l.qtyStr) === Math.round(p * 1000);
                  return (
                    <Pressable
                      key={p}
                      style={[styles.preset, on && styles.presetOn]}
                      onPress={() => setLineQty(l.key, p)}
                    >
                      <Text style={[styles.presetText, on && styles.presetTextOn]}>
                        {presetLabel(p)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.lineInputs}>
              <View style={styles.lineCol}>
                <Text style={styles.miniLabel}>Rate (₹)</Text>
                <TextInput
                  style={styles.miniInput}
                  value={l.rateStr}
                  onChangeText={(v) => updateLine(l.key, { rateStr: v })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#aaa"
                />
              </View>
              {showLineDiscount ? (
                <View style={styles.lineCol}>
                  <Text style={styles.miniLabel}>Discount (₹)</Text>
                  <TextInput
                    style={styles.miniInput}
                    value={l.discountStr}
                    onChangeText={(v) => updateLine(l.key, { discountStr: v })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#aaa"
                  />
                </View>
              ) : null}
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
          <TotalRow label={taxLabel} value={formatMoney(totals.taxTotal)} />
          {totals.discount > 0 ? (
            <TotalRow label="Discount" value={`- ${formatMoney(totals.discount)}`} />
          ) : null}
          {totals.roundOff !== 0 ? (
            <TotalRow
              label="Round off"
              value={`${totals.roundOff > 0 ? '+ ' : '- '}${formatMoney(Math.abs(totals.roundOff))}`}
            />
          ) : null}
          <TotalRow label="Grand total" value={formatMoney(totals.grandTotal)} strong />
          {supply === 'inter' ? (
            <Text style={styles.supplyNote}>
              Interstate supply{party?.state ? ` to ${party.state}` : ''} — IGST is charged instead
              of CGST + SGST.
            </Text>
          ) : null}
        </View>

        <Button
          label={isEdit ? 'Save changes' : titles.cta}
          onPress={save}
          loading={saving}
          style={styles.save}
        />
        <Text style={styles.hint}>
          {isEdit
            ? 'The bill number stays the same. Stock is corrected to match the new lines, and the payment status is worked out again.'
            : type === 'sale'
            ? 'Stock decreases when you save. Record payment from the invoice screen.'
            : isPurchase
              ? 'Stock increases when you save, and each item’s purchase price is updated to the rate you paid. Record payment from the invoice screen.'
              : isReturn
                ? 'Stock comes back in when you save, and the customer’s balance drops by this much. Record the refund from the invoice screen if you pay them back in cash.'
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
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  toggleLink: { fontSize: 13, fontWeight: '600', color: '#208AEF' },
  supplyNote: { fontSize: 12, color: '#888', marginTop: 2 },
  lineCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, gap: 10, backgroundColor: '#fafafa' },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lineName: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  lineTax: { fontSize: 12, color: '#888', fontWeight: '400' },
  remove: { fontSize: 16, color: '#c0392b', paddingHorizontal: 4 },
  lineInputs: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  lineCol: { flex: 1, gap: 4 },
  lineAmount: { flex: 1, gap: 4, alignItems: 'flex-end' },
  miniLabel: { fontSize: 11, color: '#888' },
  miniHint: { fontSize: 11, color: '#bbb' },
  qtyBlock: { gap: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: {
    width: 52,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cfe3fb',
    backgroundColor: '#eaf3fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 26, lineHeight: 30, fontWeight: '700', color: '#208AEF' },
  qtyInput: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111',
    backgroundColor: '#fff',
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  presetOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  presetText: { fontSize: 14, fontWeight: '600', color: '#666' },
  presetTextOn: { color: '#208AEF' },
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
