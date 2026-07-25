import { Stack, useLocalSearchParams } from 'expo-router';
import InvoiceForm from '@/modules/invoices/InvoiceForm';
import type { InvoiceType } from '@/utils/invoiceNumber';

const TITLES: Record<InvoiceType, string> = {
  sale: 'New Sale',
  purchase: 'New Purchase',
  quotation: 'New Quotation',
  challan: 'New Challan',
};

const VALID: InvoiceType[] = ['sale', 'purchase', 'quotation', 'challan'];

export default function NewInvoiceScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const t = (VALID.includes(type as InvoiceType) ? type : 'sale') as InvoiceType;
  return (
    <>
      <Stack.Screen options={{ title: TITLES[t] }} />
      <InvoiceForm type={t} />
    </>
  );
}
