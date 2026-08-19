import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import Button from '@/components/Button';
import SelectField from '@/components/SelectField';
import TextField from '@/components/TextField';
import AccountPicker from '@/modules/bankAccounts/AccountPicker';
import { createExpense, deleteExpense, expenseTax, updateExpense } from '@/modules/expenses/service';
import { matchOption } from '@/modules/voice/match';
import { t } from '@/modules/voice/phrases';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { EXPENSE_CATEGORIES } from '@/utils/constants';
import {
  formatMoney,
  paiseToRupeeInput,
  parseRupeesToPaise,
  parseTaxRateToBasisPoints,
  taxRateToInput,
} from '@/utils/format';
import type { Expense } from '@/db/schema';

// Shared by the "new" and "edit" expense routes. The amount typed here is the
// GROSS bill amount; the GST slab (optional) is what is already inside it, so
// the split shown under the field is backed out, never added on top — see
// modules/expenses/service.ts for the convention.

// The GST slabs a shop's overhead bills actually carry. "None" covers rent,
// wages and anything else that arrives without tax on it.
const SLABS = [0, 500, 1200, 1800, 2800];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({ expense }: { expense?: Expense }) {
  const router = useRouter();
  const { lang } = useVoice();
  const editing = !!expense;

  const [category, setCategory] = useState(expense?.category ?? '');
  const [amount, setAmount] = useState(expense ? paiseToRupeeInput(expense.amount) : '');
  const [taxRate, setTaxRate] = useState(expense ? expense.taxRate : 0);
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [notes, setNotes] = useState(expense?.notes ?? '');
  // Which account the money left. Hidden until the shop has any — see AccountPicker.
  const [accountId, setAccountId] = useState<number | null>(expense?.accountId ?? null);
  const [saving, setSaving] = useState(false);

  const paise = parseRupeesToPaise(amount);
  const split = expenseTax({ amount: paise, taxRate });

  const save = async () => {
    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      Alert.alert('Category required', 'Pick what this money was spent on.');
      return;
    }
    if (paise <= 0) {
      Alert.alert('Amount required', 'Enter an amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const data = {
        category: trimmedCategory,
        amount: paise,
        taxRate,
        accountId,
        date,
        notes: notes.trim() || null,
      };
      if (expense) await updateExpense(expense.id, data);
      else await createExpense(data);
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  const confirmDelete = () => {
    if (!expense) return;
    Alert.alert('Delete expense?', `${expense.category} · ${formatMoney(expense.amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExpense(expense.id);
          router.back();
        },
      },
    ]);
  };

  // Voice: "வாடகை" picks the category, "ஐநூறு ரூபாய்" the amount,
  // "ஜிஎஸ்டி பதினெட்டு" the slab, "சேமி" saves it.
  useVoiceCommands((intent) => {
    switch (intent.kind) {
      case 'setField':
        if (intent.field === 'category') {
          const hit = matchOption(intent.value, EXPENSE_CATEGORIES);
          setCategory(hit ?? intent.value);
          return hit ?? intent.value;
        }
        if (intent.field === 'amount' || intent.field === 'rate') {
          setAmount(intent.value);
          return true;
        }
        if (intent.field === 'tax') {
          setTaxRate(parseTaxRateToBasisPoints(intent.value));
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
      // A bare spoken word on this screen can only be the category.
      case 'search':
      case 'selectParty': {
        const hit = matchOption(intent.query, EXPENSE_CATEGORIES);
        if (!hit) return false;
        setCategory(hit);
        return hit;
      }
      case 'clear':
        setAmount('');
        setNotes('');
        return t('cleared', lang);
      case 'action':
        if (intent.action !== 'delete' || !editing) return false;
        confirmDelete();
        return true;
      case 'submit':
        void save();
        return true;
      default:
        return false;
    }
  }, EXPENSE_CATEGORIES);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <SelectField
          label="Category"
          value={category}
          onSelect={setCategory}
          options={EXPENSE_CATEGORIES}
          placeholder="What was it spent on?"
          required
          allowCustom
        />

        <TextField
          label="Amount paid (₹)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          keyboardType="numeric"
          required
        />
        <Text style={styles.hint}>Enter the total on the bill — GST included.</Text>

        <View>
          <Text style={styles.label}>GST in this amount</Text>
          <View style={styles.slabRow}>
            {SLABS.map((bp) => {
              const active = taxRate === bp;
              return (
                <Pressable
                  key={bp}
                  style={[styles.slab, active && styles.slabActive]}
                  onPress={() => setTaxRate(bp)}
                >
                  <Text style={[styles.slabText, active && styles.slabTextActive]}>
                    {bp === 0 ? 'None' : `${taxRateToInput(bp)}%`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {taxRate > 0 && paise > 0 ? (
            <Text style={styles.split}>
              Taxable {formatMoney(split.amount)} + GST {formatMoney(split.tax)}
            </Text>
          ) : null}
        </View>

        <AccountPicker value={accountId} onChange={setAccountId} label="Paid from" />

        <TextField
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

        <Button
          label={editing ? 'Save changes' : 'Add expense'}
          onPress={save}
          loading={saving}
          style={styles.save}
        />
        {editing ? (
          <Button label="Delete expense" tone="danger" onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  hint: { fontSize: 12, color: '#888', marginTop: -8 },
  slabRow: { flexDirection: 'row', gap: 8 },
  slab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  slabActive: { backgroundColor: '#208AEF', borderColor: '#208AEF' },
  slabText: { fontWeight: '600', color: '#666', fontSize: 14 },
  slabTextActive: { color: '#fff' },
  split: { fontSize: 12, color: '#888', marginTop: 8 },
  save: { marginTop: 8 },
});
