import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import ExpenseForm from '@/modules/expenses/ExpenseForm';
import { getExpense } from '@/modules/expenses/service';
import type { Expense } from '@/db/schema';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const expenseId = Number(id);
  const [expense, setExpense] = useState<Expense | null | undefined>(undefined);

  useEffect(() => {
    getExpense(expenseId).then((e) => setExpense(e ?? null));
  }, [expenseId]);

  if (expense === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (expense === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Expense not found.</Text>
      </View>
    );
  }
  return <ExpenseForm expense={expense} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
});
