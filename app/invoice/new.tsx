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
  // `partyId` is optional — it arrives when the bill was started from a party's
  // ledger (by tap or by voice), so the customer is already filled in.
  const { type, partyId } = useLocalSearchParams<{ type?: string; partyId?: string }>();
  const t = (VALID.includes(type as InvoiceType) ? type : 'sale') as InvoiceType;
  const initialPartyId = Number(partyId) || undefined;
  return (
    <>
      <Stack.Screen options={{ title: TITLES[t] }} />
      <InvoiceForm type={t} initialPartyId={initialPartyId} />
    </>
  );
}
