import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getInvoice } from '@/modules/invoices/service';
import InvoiceForm from '@/modules/invoices/InvoiceForm';
import type { InvoiceType } from '@/utils/invoiceNumber';

const TITLES: Record<InvoiceType, string> = {
  sale: 'Edit Sale',
  purchase: 'Edit Purchase',
  quotation: 'Edit Quotation',
  challan: 'Edit Challan',
  saleReturn: 'Edit Sale Return',
  purchaseReturn: 'Edit Purchase Return',
};

/**
 * Correcting a saved document. The type is read from the document rather than
 * passed in — an invoice can be edited, but it can never become a different
 * kind of document.
 */
export default function EditInvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = Number(id);
  const [type, setType] = useState<InvoiceType | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getInvoice(invoiceId).then((inv) => {
      if (active) setType(inv?.type ?? null);
    });
    return () => {
      active = false;
    };
  }, [invoiceId]);

  if (type === undefined) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Edit' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (type === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Edit' }} />
        <Text style={styles.missing}>That document no longer exists.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: TITLES[type] }} />
      <InvoiceForm type={type} editInvoiceId={invoiceId} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missing: { color: '#888' },
});
