// Add or correct one cash box / bank account. Shared by the new and edit routes.

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
import TextField from '@/components/TextField';
import {
  createBankAccount,
  deleteBankAccount,
  updateBankAccount,
} from '@/modules/bankAccounts/service';
import { paiseToRupeeInput, parseRupeesToPaise } from '@/utils/format';
import type { BankAccount } from '@/db/schema';

const TYPES: { key: BankAccount['type']; label: string; hint: string }[] = [
  { key: 'cash', label: 'Cash', hint: 'The counter drawer or the tin at home.' },
  { key: 'bank', label: 'Bank', hint: 'A current/savings account, or a UPI-linked one.' },
];

export default function AccountForm({ account }: { account?: BankAccount }) {
  const router = useRouter();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<BankAccount['type']>(account?.type ?? 'cash');
  const [opening, setOpening] = useState(
    account ? paiseToRupeeInput(account.openingBalance) : '',
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Give the account a name you will recognise.');
      return;
    }
    setSaving(true);
    try {
      const data = { name: trimmed, type, openingBalance: parseRupeesToPaise(opening) };
      if (account) await updateBankAccount(account.id, data);
      else await createBankAccount(data);
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    }
  };

  const confirmDelete = () => {
    if (!account) return;
    Alert.alert('Delete this account?', `"${account.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBankAccount(account.id);
            router.back();
          } catch {
            // The foreign key holds: money already recorded against this account
            // must not be left pointing at nothing.
            Alert.alert(
              'Cannot delete',
              'Payments or expenses have already gone through this account. Move them first.',
            );
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Counter cash / SBI current"
          required
        />

        <View>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => {
              const active = type === t.key;
              return (
                <Pressable
                  key={t.key}
                  style={[styles.typeBtn, active && styles.typeOn]}
                  onPress={() => setType(t.key)}
                >
                  <Text style={[styles.typeText, active && styles.typeTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{TYPES.find((t) => t.key === type)?.hint}</Text>
        </View>

        <TextField
          label="Opening balance (₹)"
          value={opening}
          onChangeText={setOpening}
          placeholder="0"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>
          What is in it today, before the app starts tracking. Everything recorded from now on moves
          the balance from here.
        </Text>

        <Button
          label={account ? 'Save changes' : 'Add account'}
          onPress={save}
          loading={saving}
          style={styles.save}
        />

        {account ? (
          <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
            <Text style={styles.deleteText}>Delete account</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  typeText: { fontSize: 14, fontWeight: '600', color: '#666' },
  typeTextOn: { color: '#208AEF' },
  hint: { fontSize: 12, color: '#888', marginTop: 6 },
  save: { marginTop: 8 },
  deleteBtn: { alignItems: 'center', padding: 12 },
  deleteText: { color: '#c0392b', fontWeight: '600', fontSize: 15 },
});
