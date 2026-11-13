import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BooksToggle from '@/components/BooksToggle';
import Button from '@/components/Button';
import PickerField, { type PickerOption } from '@/components/PickerField';
import TextField from '@/components/TextField';
import AccountPicker from '@/modules/bankAccounts/AccountPicker';
import { listInvoicesByParty } from '@/modules/invoices/service';
import { partyDetailLines } from '@/modules/parties/describe';
import { listParties } from '@/modules/parties/service';
import {
  deletePayment,
  recordPayment,
  updatePayment,
  type Direction,
} from '@/modules/payments/service';
import { bestMatch, spokenNames } from '@/modules/voice/match';
import { t } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { formatDate, formatMoney, paiseToRupeeInput, parseRupeesToPaise } from '@/utils/format';
import type { Invoice, Party, Payment } from '@/db/schema';

const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'in', label: '↓ Payment In' },
  { key: 'out', label: '↑ Payment Out' },
];

const MODES: { key: Payment['mode']; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'bank', label: 'Bank' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentForm({
  presetPartyId,
  presetInvoiceId,
  direction,
  payment,
}: {
  presetPartyId?: number;
  presetInvoiceId?: number;
  /**
   * Editing: every field starts from what this payment already says — its
   * direction (a refund stays a refund), account, bill link and books flag —
   * never from the defaults.
   */
  payment?: Payment;
  /**
   * Fixes which way the money runs and narrows the party picker to that side.
   * Left out when the screen was opened from a party or an invoice — there the
   * direction follows the party and stays switchable.
   */
  direction?: Direction;
}) {
  const router = useRouter();
  const { lang } = useVoice();
  const [allParties, setAllParties] = useState<Party[]>([]);
  const editing = !!payment;
  // An old row with no stored direction gets one from its party once the
  // parties load (see the effect below) — the same rule the list shows.
  const [dir, setDir] = useState<Direction>(payment?.direction ?? direction ?? 'in');
  const [invoicesForParty, setInvoicesForParty] = useState<Invoice[]>([]);
  const [partyId, setPartyId] = useState<number | null>(payment?.partyId ?? presetPartyId ?? null);
  const [invoiceId, setInvoiceId] = useState<number | null>(
    payment ? payment.invoiceId : (presetInvoiceId ?? null),
  );
  const [amount, setAmount] = useState(payment ? paiseToRupeeInput(payment.amount) : '');
  const [mode, setMode] = useState<Payment['mode']>(payment?.mode ?? 'cash');
  // Which cash box or bank account the money moved through. Stays null — and
  // the field stays hidden — until the shop has set accounts up.
  const [accountId, setAccountId] = useState<number | null>(payment?.accountId ?? null);
  const [date, setDate] = useState(payment?.date ?? todayISO());
  const [notes, setNotes] = useState(payment?.notes ?? '');
  // In the books unless said otherwise — see components/BooksToggle.
  const [accounted, setAccounted] = useState(payment?.accounted ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listParties().then(setAllParties);
  }, []);

  // Opened as "Payment In"/"Payment Out": the picker only offers the side that
  // normally moves money that way, so it can't be booked against the wrong one.
  // Opened from a party or invoice: every party stays selectable, because the
  // preset one must not vanish from the list.
  const narrowToSide = !!direction && presetPartyId == null;
  const parties = useMemo(
    () =>
      !narrowToSide
        ? allParties
        : allParties.filter((p) => (dir === 'out' ? p.type === 'supplier' : p.type === 'customer')),
    [allParties, narrowToSide, dir],
  );

  // Without a fixed direction the party decides it: a customer normally pays in,
  // a supplier is normally paid out. The toggle below can still override it —
  // that's how a refund gets recorded.
  // An edit keeps the direction it was saved with while the party is unchanged.
  useEffect(() => {
    if (direction || partyId == null) return;
    if (payment && payment.direction != null && partyId === payment.partyId) return;
    const p = allParties.find((x) => x.id === partyId);
    if (p) setDir(p.type === 'supplier' ? 'out' : 'in');
  }, [allParties, partyId, direction, payment]);

  // Load the chosen party's unpaid sale/purchase invoices for optional linking.
  useEffect(() => {
    if (partyId == null) {
      setInvoicesForParty([]);
      return;
    }
    let active = true;
    listInvoicesByParty(partyId).then((rows) => {
      if (!active) return;
      // The bill an edited payment is already against always stays offered —
      // it may show as paid (by this very payment) or be a return note.
      setInvoicesForParty(
        rows.filter(
          (r) =>
            r.id === payment?.invoiceId ||
            ((r.type === 'sale' || r.type === 'purchase') && r.paymentStatus !== 'paid'),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [partyId, payment?.invoiceId]);

  // Name, then mobile, town and GST number — the bill is often made while the
  // customer is standing there, and picking the wrong namesake is only caught
  // by those. They are searchable too, so "madurai" or a GST number finds them.
  const partyOptions: PickerOption[] = useMemo(
    () =>
      parties.map((p) => ({
        id: p.id,
        label: p.name,
        details: partyDetailLines(p),
      })),
    [parties],
  );

  const invoiceOptions: PickerOption[] = useMemo(
    () =>
      invoicesForParty.map((inv) => ({
        id: inv.id,
        label: inv.invoiceNo,
        sublabel: `${formatMoney(inv.grandTotal)} · ${formatDate(inv.date)}`,
      })),
    [invoicesForParty],
  );

  // Voice: "ராஜேஷ்" picks the party, "ஐநூறு ரூபாய்" the amount, "ஜிபே" the mode,
  // "சேமி" records it. A bare number is read as the amount.
  const voiceHints = useMemo(() => parties.flatMap((p) => spokenNames(p)), [parties]);

  useVoiceCommands((intent) => {
    switch (intent.kind) {
      case 'selectParty':
      case 'addLine': {
        // On this screen a spoken name can only mean one thing: who paid.
        // (A bare number arrives as setField 'amount' instead — see the parser.)
        const query = intent.kind === 'selectParty' ? intent.query : intent.itemQuery;
        const hit = bestMatch(query, parties);
        if (!hit) return t('noParty', lang);
        setPartyId(hit.value.id);
        return hit.value.name;
      }
      case 'setField':
        if (intent.field === 'amount' || intent.field === 'rate') {
          setAmount(intent.value);
          return true;
        }
        if (intent.field === 'date') {
          setDate(intent.value);
          return true;
        }
        if (intent.field === 'notes') {
          setNotes(intent.value);
          return true;
        }
        return false;
      case 'setPaymentMode':
        setMode(intent.mode);
        return MODES.find((m) => m.key === intent.mode)?.label ?? true;
      case 'clear':
        setAmount('');
        setNotes('');
        return t('cleared', lang);
      case 'action':
        if (intent.action !== 'delete') return false;
        if (editing) {
          confirmDelete();
          return true;
        }
        // Nothing saved to delete yet — clear what has been typed instead.
        setAmount('');
        setNotes('');
        return t('cleared', lang);
      case 'submit':
        void save();
        return true;
      default:
        return false;
    }
  }, voiceHints);

  const save = async () => {
    if (partyId == null) {
      Alert.alert('Party required', 'Select who this payment is with.');
      return;
    }
    const paise = parseRupeesToPaise(amount);
    if (paise <= 0) {
      Alert.alert('Amount required', 'Enter a payment amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        partyId,
        invoiceId: invoiceId ?? null,
        amount: paise,
        mode,
        direction: dir,
        accountId,
        date,
        notes: notes.trim() || null,
        accounted,
      };
      // updatePayment refreshes the paid status of the old and the new bill.
      if (payment) await updatePayment(payment.id, data);
      else await recordPayment(data);
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  const confirmDelete = () => {
    if (!payment) return;
    Alert.alert(
      'Delete payment?',
      `${formatMoney(payment.amount)}. The invoice's paid status will be recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deletePayment(payment.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.label}>Direction</Text>
          <View style={styles.modeRow}>
            {DIRECTIONS.map((d) => {
              const active = dir === d.key;
              return (
                <Pressable
                  key={d.key}
                  style={[
                    styles.dirChip,
                    active && (d.key === 'in' ? styles.dirChipIn : styles.dirChipOut),
                  ]}
                  onPress={() => setDir(d.key)}
                >
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {dir === 'in' ? 'Money received from this party.' : 'Money paid to this party.'}
          </Text>
        </View>

        <PickerField
          label={dir === 'out' ? 'Paid to' : 'Received from'}
          value={partyId}
          onSelect={(id) => {
            setPartyId(id);
            setInvoiceId(null); // clear stale link when party changes
          }}
          options={partyOptions}
          placeholder="Select party"
          required
          emptyText={
            !narrowToSide
              ? 'No parties yet — add one from the Parties tab.'
              : dir === 'in'
                ? 'No customers yet — add one from the Parties tab.'
                : 'No suppliers yet — add one from the Parties tab.'
          }
          searchPlaceholder="Search by name, phone, town or GSTIN"
        />

        <TextField
          label="Amount (₹)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          keyboardType="numeric"
          required
        />

        <View>
          <Text style={styles.label}>Mode</Text>
          <View style={styles.modeRow}>
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <Pressable
                  key={m.key}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                  onPress={() => setMode(m.key)}
                >
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Renders nothing until the shop has set up a cash box or bank
            account — see AccountPicker. */}
        <AccountPicker
          value={accountId}
          onChange={setAccountId}
          label={dir === 'in' ? 'Received into' : 'Paid from'}
        />

        {invoiceOptions.length > 0 ? (
          <View>
            <PickerField
              label="Against invoice (optional)"
              value={invoiceId}
              onSelect={setInvoiceId}
              options={invoiceOptions}
              placeholder="On-account (no specific invoice)"
            />
            {invoiceId != null ? (
              <Pressable onPress={() => setInvoiceId(null)}>
                <Text style={styles.clearLink}>Clear — record as on-account</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <TextField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

        <BooksToggle value={accounted} onChange={setAccounted} />

        <Button
          label={editing ? 'Save changes' : 'Record payment'}
          onPress={save}
          loading={saving}
          style={styles.save}
        />
        {editing ? <Button label="Delete payment" tone="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  modeChipActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  modeText: { fontWeight: '600', color: '#666', fontSize: 14 },
  modeTextActive: { color: '#fff' },
  clearLink: { color: '#208AEF', fontSize: 13, marginTop: 6 },
  dirChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  dirChipIn: { backgroundColor: '#1a9d5a', borderColor: '#1a9d5a' },
  dirChipOut: { backgroundColor: '#c0392b', borderColor: '#c0392b' },
  hint: { fontSize: 12, color: '#888', marginTop: 6 },
  save: { marginTop: 8 },
});
