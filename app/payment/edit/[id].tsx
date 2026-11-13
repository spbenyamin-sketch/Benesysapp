import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import PaymentForm from '@/modules/payments/PaymentForm';
import { getPayment } from '@/modules/payments/service';
import type { Payment } from '@/db/schema';

export default function EditPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const paymentId = Number(id);
  const [payment, setPayment] = useState<Payment | null | undefined>(undefined);

  useEffect(() => {
    getPayment(paymentId).then((p) => setPayment(p ?? null));
  }, [paymentId]);

  if (payment === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (payment === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>Payment not found.</Text>
      </View>
    );
  }
  return <PaymentForm payment={payment} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
});
