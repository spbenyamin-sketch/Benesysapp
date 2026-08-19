import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AccountForm from '@/modules/bankAccounts/AccountForm';
import { getBankAccount } from '@/modules/bankAccounts/service';
import type { BankAccount } from '@/db/schema';

export default function EditAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const [account, setAccount] = useState<BankAccount | null | undefined>(undefined);

  useEffect(() => {
    getBankAccount(accountId).then((a) => setAccount(a ?? null));
  }, [accountId]);

  if (account === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (account === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Account not found.</Text>
      </View>
    );
  }
  return <AccountForm account={account} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
});
